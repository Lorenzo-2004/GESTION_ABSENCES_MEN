"""Extraction des données d'une décision de congé à partir d'un scan (RG-05).

Prend en charge :
- les images JPG, PNG et TIFF (multi-pages compris) ;
- les PDF à texte sélectionnable (lus sans OCR, donc sans Tesseract) ;
- les PDF scannés (page convertie en image puis reconnue par Tesseract).

Principes :
- le moteur ne bloque jamais la RH : en cas d'échec, `source` vaut SAISIE_MANUELLE ;
- l'échec n'est plus silencieux : `avertissements` dit pourquoi (Tesseract absent,
  langue française manquante, document illisible, aucune donnée reconnue) ;
- `champs_manquants` liste ce que la RH doit compléter à la main.
"""

import io
import logging
import os
import re
import shutil
from datetime import date as date_type
from pathlib import Path

logger = logging.getLogger(__name__)

# Moteur OCR optionnel : sans lui, seuls les PDF à texte natif sont lisibles.
try:
    import pytesseract
    from PIL import Image, ImageChops, ImageOps, ImageSequence

    _MOTEUR_DISPONIBLE = True
except Exception:  # noqa: BLE001 - dépendance optionnelle
    pytesseract = None
    Image = ImageChops = ImageOps = ImageSequence = None
    _MOTEUR_DISPONIBLE = False

# Lecture des PDF avec PyMuPDF (« pymupdf » depuis la 1.24.3, « fitz » avant).
try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

PAGES_MAX = 5  # une décision tient sur 1 ou 2 pages ; on borne le temps de calcul
LARGEUR_MIN_PIXELS = 1600  # en dessous, l'image est agrandie avant reconnaissance
ZOOM_PDF = 4  # ≈ 290 dpi : bon compromis précision / mémoire
SEUIL_TEXTE_NATIF = 80  # caractères minimum pour considérer qu'une page PDF a du texte
SEUIL_LISIBILITE = 4  # mots français minimum avant de tenter d'autres rotations

_LANGUES_SOUHAITEES = ("fra", "eng")
_langues_cache = None


# --------------------------------------------------------------------------- #
#  Motifs d'extraction
# --------------------------------------------------------------------------- #

# Matricule : « IM : 123 456 », « I.M. 123456 », « Matricule 123.456 ».
# Les groupes de chiffres sont bornés pour ne pas absorber l'indice qui suit.
_MOTIF_IM = re.compile(
    r"(?:\bI\.?M\b\.?|matricule|immatriculation)\s*(?:n[°ºo]\.?)?\s*[:.\-]?\s*"
    r"(\d{1,3}(?:[ .]\d{3}){1,2}(?!\d)|\d{4,9}(?!\d))",
    re.IGNORECASE,
)

# Numéro placé juste après le titre : « DÉCISION N° 2205 MEN/SG/DRH ».
_NUMERO_DECISION = r"(?:\d{1,3}(?:[ \t]\d{3}){1,2}|\d{1,6})(?:[ \t]*-[ \t]*[A-Za-z0-9.]+)*(?:[ \t]*/[ \t]*[A-Za-z0-9.-]+){0,3}"
_MOTIF_NUMERO_MARQUE = re.compile(
    r"\[\[NUMERO_DECISION_OCR\]\]\s*([0-9A-Za-z ./\t-]{1,60}?)\s*"
    r"\[\[/NUMERO_DECISION_OCR\]\]",
    re.IGNORECASE,
)
_MOTIF_NUMERO_EXPLICITE = re.compile(
    rf"\b(?:num[ée]ro[ \t]+de[ \t]+d[ée]cision|n[°ºo][ \t]*(?:de[ \t]+)?d[ée]cision)"
    rf"[ \t]*[:：#-]?[ \t]*({_NUMERO_DECISION})(?![\d])",
    re.IGNORECASE,
)
_MOTIF_NUMERO_SEUL = re.compile(
    rf"\bnum[ée]ro[ \t]*[:：#-][ \t]*({_NUMERO_DECISION})(?![\d])",
    re.IGNORECASE,
)
# Certains modèles présentent un libellé seul (« Numéro », « N° de décision »)
# puis la valeur sur la ligne suivante. Garder ce chemin dédié pour éviter de
# confondre cette valeur avec un numéro d'article ou une date ailleurs.
_MOTIF_NUMERO_LIBELLE_LIGNE_SUIVANTE = re.compile(
    rf"^[ \t]*(?:num[ée]ro(?:[ \t]+de[ \t]+d[ée]cision)?|"
    rf"n[°ºo](?:[ \t]+(?:de[ \t]+)?d[ée]cision)?)[ \t]*[:：#-]?[ \t]*\r?\n"
    rf"[ \t]*(?P<numero>{_NUMERO_DECISION})(?![\d])",
    re.IGNORECASE | re.MULTILINE,
)
_MOTIF_DECISION_LIGNE_SUIVANTE = re.compile(
    rf"^[ \t]*d[ée]cision[ \t]*(?:n[°ºo]\.?[ \t]*)?[:：]?[ \t]*\r?\n"
    rf"[ \t]*(?P<numero>{_NUMERO_DECISION})(?![\d/])",
    re.IGNORECASE | re.MULTILINE,
)
_MOTIF_NUMERO_APRES_TITRE = re.compile(
    rf"\bD[ÉE]CISION\s*(?:n[°ºo]\.?|num[ée]ro)\s*[:.]?\s*"
    rf"({_NUMERO_DECISION})(?![\d/])",
    re.IGNORECASE,
)

# Numéro seul sur la ligne qui précède le titre.
_MOTIF_NUMERO_AVANT_TITRE = re.compile(
    r"\b(\d{1,6})[ \t]*(?:\r?\n[ \t]*)+D[ÉE]CISION\b",
    re.IGNORECASE,
)

# Dernier recours : n'importe quel « N° 123 », sauf s'il cite un texte de référence.
_MOTIF_NUMERO_GENERIQUE = re.compile(
    rf"\bn\s*(?:[°º]|o)\s*[:.]?\s*({_NUMERO_DECISION})(?![\d/])",
    re.IGNORECASE,
)
_TEXTES_DE_REFERENCE = re.compile(
    r"d[ée]cret|arr[êe]t[ée]|loi|ordonnance|circulaire|note|r[ée]f[ée]rence|vu\b",
    re.IGNORECASE,
)

# Suffixe d'indice autorisé : « 231 T », « 231T », « 231 - t ».
# L'espace est volontairement horizontal : ne jamais prendre la première lettre
# du champ qui commence sur la ligne suivante (par exemple « Corps et Grade »).
_MOTIF_INDICE = re.compile(
    r"\bindice\b\s*[:.]?\s*(?P<nombre>\d{2,6})(?!\d)"
    r"(?:[ \t]*-?[ \t]*(?P<suffixe>[A-Za-z])"
    r"(?=[ \t]*(?:$|[\r\n,;.)]|\b(?:corps|grade|budget|imputation|"
    r"au\s+titre|ann[ée]e)\b)))?",
    re.IGNORECASE | re.MULTILINE,
)

# Années de congé : « au titre de l'année 2025 », « au titre des années 2024 et 2025 »,
# « au titre des exercices 2023 à 2025 », « au titre de 2025 ».
_ANNEE = r"(?:19|20)\d{2}"
_MOTIF_ANNEES = re.compile(
    r"(?:"
    r"\bau\s+titre\s+(?:(?:de\s+l['’]\s*|de\s+la\s+|des\s+|du\s+|de\s+)?"
    r"(?:ann[ée]es?(?:\s*\(s\))?|exercices?|cong[ée])?)\s*[:：]?\s*|"
    r"\bann[ée]es?(?:\s*\(s\))?\s+au\s+titre(?:\s+du\s+cong[ée])?\s*[:：]?\s*|"
    r"\bdroit\s+de\s+cong[ée]\s+pour\s+l['’]?ann[ée]e\s*[:：]?\s*|"
    r"\bann[ée]es?(?:\s*\(s\))?\s+du\s+cong[ée]\s*[:：]?\s*"
    r")"
    rf"(?P<liste>{_ANNEE}(?:\s*(?:,|;|et|&|/|-|–|—|à|au)\s*{_ANNEE})*)",
    re.IGNORECASE,
)

# Mots français courants : sert à juger si le texte reconnu est lisible.
_MOTS_FRANCAIS = re.compile(
    r"\b(?:du|la|le|les|de|des|budget|indice|matricule|jour|jours|annee|année|décision|decision)\b",
    re.IGNORECASE,
)

# Un cachet administratif se trouve souvent dans la partie basse du document.
# Le repère permet de distinguer son texte des paragraphes de la décision.
_MARQUEUR_CACHET = re.compile(
    r"\[\[CACHET_OCR_PAGE_\d+\]\](.*?)\[\[/CACHET_OCR\]\]",
    re.IGNORECASE | re.DOTALL,
)
_MOTIF_FONCTION_SIGNATAIRE = re.compile(
    r"\b(?:ministre|directeur(?:rice)?|secr[ée]taire\s+g[ée]n[ée]ral(?:e)?|"
    r"chef\s+(?:de\s+)?(?:service|cabinet|division|d[ée]partement)|"
    r"pr[ée]fet|gouverneur|inspecteur(?:rice)?|ordonnateur(?:rice)?|"
    r"responsable|d[ée]l[ée]gu[ée](?:e)?|proviseur|recteur|coordinateur(?:rice)?)\b",
    re.IGNORECASE,
)
_MOTIFS_CACHEt_INSTITUTIONNELS = re.compile(
    r"\b(?:r[ée]publique|madagascar|minist[èe]re|[ée]ducation|nationale|"
    r"signature|cachet|conforme|original|document|d[ée]cision|fait\s+[àa]|"
    r"antananarivo|budget|imputation|matricule|indice|ann[ée]e|cong[ée])\b",
    re.IGNORECASE,
)

_MOTIF_LIGNE_NON_NOM = re.compile(
    r"\b(?:minist[èe]re|[ée]ducation|nationale|r[ée]publique|madagascar|"
    r"secr[ée]taire|g[ée]n[ée]r(?:al|a)\w*|directeur(?:rice)?|chef|"
    r"ressources|humaines|signature|cachet|d[ée]l[ée]gu[ée]|"
    r"vu|article|d[ée]cision|arr[êe]t[ée])\b",
    re.IGNORECASE,
)


# --------------------------------------------------------------------------- #
#  Moteur Tesseract
# --------------------------------------------------------------------------- #


def _chemin_tesseract():
    """Cherche Tesseract : variable TESSERACT_CMD, PATH, puis emplacements Windows."""
    force = os.environ.get("TESSERACT_CMD")
    if force and Path(force).is_file():
        return force

    dans_le_path = shutil.which("tesseract")
    if dans_le_path:
        return dans_le_path

    candidats = [
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
        Path.home() / "AppData" / "Local" / "Programs" / "Tesseract-OCR" / "tesseract.exe",
    ]
    for candidat in candidats:
        if candidat.is_file():
            return str(candidat)
    return None


def _configurer_tesseract():
    chemin = _chemin_tesseract()
    if chemin:
        pytesseract.pytesseract.tesseract_cmd = chemin
    return chemin


def _langues_ocr(avertissements):
    """Langues réellement installées parmi français et anglais (mises en cache)."""
    global _langues_cache
    if _langues_cache is None:
        try:
            installees = set(pytesseract.get_languages(config=""))
        except Exception:  # noqa: BLE001 - la liste n'est qu'un confort
            installees = set(_LANGUES_SOUHAITEES)
        _langues_cache = [lg for lg in _LANGUES_SOUHAITEES if lg in installees] or ["eng"]

    if "fra" not in _langues_cache:
        avertissements.append(
            "Le français n'est pas installé dans Tesseract (fichier fra.traineddata) : "
            "les accents seront mal reconnus."
        )
    return "+".join(_langues_cache)


_MOTS_CHAMPS_DECISION = re.compile(
    r"\b(?:d[ée]cision|matricule|imputation|budget|indice|corps|grade|"
    r"cong[ée]|jours?|ann[ée]es?|signataire|signature|agent|b[ée]n[ée]ficiaire|"
    r"r[ée]f[ée]rence|[ée]mission|[ée]mis|fait|direction|titre)\b",
    re.IGNORECASE,
)


def _score_lisibilite(texte):
    """Favorise un OCR lisible contenant les libellés attendus d'une décision RH."""
    texte = texte or ""
    utile = sum(1 for c in texte if c.isalnum() or c.isspace())
    mots_generaux = len(_MOTS_FRANCAIS.findall(texte))
    champs = len(_MOTS_CHAMPS_DECISION.findall(texte))
    return mots_generaux * 1000 + champs * 350 + utile


def _preparer(image):
    """Redresse (EXIF), passe en niveaux de gris, agrandit si besoin et contraste."""
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:  # noqa: BLE001
        pass
    image = image.convert("L")
    if image.width < LARGEUR_MIN_PIXELS:
        facteur = LARGEUR_MIN_PIXELS / image.width
        image = image.resize(
            (LARGEUR_MIN_PIXELS, round(image.height * facteur)), Image.LANCZOS
        )
    return ImageOps.autocontrast(image)


def _lire_image(image, avertissements):
    """Reconnaît les pages en testant plusieurs segmentations Tesseract raisonnables."""
    langue = _langues_ocr(avertissements)
    preparee = _preparer(image)

    # Les décisions peuvent être composées en paragraphes, colonnes ou champs espacés.
    # Tester les segmentations courantes évite de dépendre d'un seul mode Tesseract.
    candidats = []
    for config in ("", "--psm 6", "--psm 11"):
        try:
            reconnu = pytesseract.image_to_string(preparee, lang=langue, config=config) or ""
            candidats.append((_score_lisibilite(reconnu), reconnu))
        except Exception as exc:  # noqa: BLE001 - une variante échouée ne bloque pas le scan
            logger.debug("Échec OCR avec config %r : %s", config, type(exc).__name__)

    meilleur = max(candidats, default=(0, ""), key=lambda item: item[0])[1]
    if len(_MOTS_FRANCAIS.findall(meilleur)) >= SEUIL_LISIBILITE and len(_MOTS_CHAMPS_DECISION.findall(meilleur)) >= 2:
        return meilleur

    # Si la page est peu lisible, vérifier les orientations courantes avec une segmentation stable.
    for angle in (180, 90, 270):
        try:
            tournee = preparee.rotate(angle, expand=True)
            for config in ("--psm 6", "--psm 11"):
                essai = pytesseract.image_to_string(tournee, lang=langue, config=config) or ""
                candidats.append((_score_lisibilite(essai), essai))
        except Exception as exc:  # noqa: BLE001
            logger.debug("Échec OCR après rotation %s° : %s", angle, type(exc).__name__)

    return max(candidats, default=(0, ""), key=lambda item: item[0])[1]


def _lire_zone_cachet(image, avertissements):
    """OCR renforcé sur la zone basse, où se trouvent généralement cachet et signataire.

    On essaie plusieurs canaux de contraste : un cachet bleu/rouge peut être quasi invisible
    en niveaux de gris, et une page PDF déjà textuelle peut encore contenir un cachet en image.
    Le résultat reste une proposition à vérifier par la RH, pas une preuve d'identité.
    """
    if not _MOTEUR_DISPONIBLE:
        return ""

    try:
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:  # noqa: BLE001
            pass
        couleur = image.convert("RGB")
        # Le cachet est usuellement dans la moitié basse. Garder toute la largeur permet
        # de couvrir les cachets centrés, à gauche ou à droite sans supposer un emplacement fixe.
        zone = couleur.crop((0, int(couleur.height * 0.38), couleur.width, couleur.height))
        if zone.width < LARGEUR_MIN_PIXELS:
            facteur = LARGEUR_MIN_PIXELS / max(zone.width, 1)
            zone = zone.resize(
                (LARGEUR_MIN_PIXELS, max(1, round(zone.height * facteur))), Image.LANCZOS
            )

        gris = ImageOps.autocontrast(zone.convert("L"))
        rouge = ImageOps.autocontrast(zone.getchannel("R"))
        bleu = ImageOps.autocontrast(zone.getchannel("B"))
        binaire = gris.point(lambda pixel: 255 if pixel > 172 else 0)
        essais = [(gris, 6), (gris, 11), (rouge, 11), (bleu, 11), (binaire, 6)]
        avertissements_ocr = []
        langue = _langues_ocr(avertissements_ocr)
        meilleur = ""
        meilleur_score = 0

        for variante, mode_page in essais:
            reconnu = pytesseract.image_to_string(
                variante, lang=langue, config=f"--psm {mode_page}"
            ) or ""
            score = _score_lisibilite(reconnu)
            score += len(re.findall(r"[A-Za-zÀ-ÿ]{2,}", reconnu)) * 8
            score += len(_MOTIF_FONCTION_SIGNATAIRE.findall(reconnu)) * 80
            if score > meilleur_score:
                meilleur, meilleur_score = reconnu, score

        for avertissement in avertissements_ocr:
            if avertissement not in avertissements:
                avertissements.append(avertissement)
        return meilleur.strip()
    except Exception as exc:  # noqa: BLE001 - l'analyse du cachet ne doit pas bloquer le scan
        logger.info("Cachet de décision non reconnu : %s", type(exc).__name__)
        return ""


def _candidats_numero_tamponne(texte):
    """Retourne les candidats de quatre chiffres lus dans une zone de cachet.

    Les années courantes (1900-2099) et les morceaux de références/date liés par
    une ponctuation sont exclus : ils ne constituent pas une preuve du numéro
    tamponné. Plusieurs candidats peuvent être retournés pour permettre un vote
    entre plusieurs configurations OCR.
    """
    if not texte:
        return []

    substitutions = str.maketrans({
        "O": "0", "Q": "0", "D": "0", "I": "1", "L": "1",
        "|": "1", "S": "5",
    })
    motif = re.compile(
        r"(?<![A-Za-z0-9])([0-9OQDIL|S](?:[ \t]*[0-9OQDIL|S]){3})(?![A-Za-z0-9])",
        re.IGNORECASE,
    )
    candidats = []
    for ligne in str(texte).replace("\r", "\n").splitlines():
        for trouve in motif.finditer(ligne):
            avant = ligne[:trouve.start()].rstrip()
            apres = ligne[trouve.end():].lstrip()
            # Ne pas prendre une partie de décret, date ou référence composée.
            if avant.endswith(("-", ".", "/")) or apres.startswith(("-", ".", "/")):
                continue
            candidat = re.sub(r"[ \t]+", "", trouve.group(1).upper()).translate(substitutions)
            if not re.fullmatch(r"\d{4}", candidat):
                continue
            valeur = int(candidat)
            if 1900 <= valeur <= 2099:
                continue
            if candidat not in candidats:
                candidats.append(candidat)
    return candidats


def _extraire_numero_tamponne(texte):
    """Extrait le premier candidat valable de quatre chiffres d'une zone tamponnée."""
    candidats = _candidats_numero_tamponne(texte)
    return candidats[0] if candidats else None


def _choisir_numero_par_consensus(essais):
    """Choisit un numéro seulement si plusieurs lectures OCR indépendantes concordent.

    Chaque élément de ``essais`` représente une lecture/configuration OCR et contient
    ses candidats. Une lecture avec plusieurs candidats valides est ambiguë et ne vote
    pas. Il faut au moins deux votes identiques et une majorité stricte ; en cas d'égalité
    ou de lecture isolée, on laisse le champ vide pour vérification RH.
    """
    votes = {}
    for candidats_essai in essais or []:
        if isinstance(candidats_essai, str):
            candidats_essai = [candidats_essai]
        valides = []
        for valeur in candidats_essai or []:
            candidat = _extraire_numero_tamponne(str(valeur))
            if candidat and candidat not in valides:
                valides.append(candidat)
        if len(valides) == 1:
            candidat = valides[0]
            votes[candidat] = votes.get(candidat, 0) + 1

    if not votes:
        return None
    tries = sorted(votes.items(), key=lambda item: item[1], reverse=True)
    meilleur_numero, meilleur_score = tries[0]
    total_votes = sum(votes.values())
    if meilleur_score < 2 or meilleur_score * 2 <= total_votes:
        return None
    if len(tries) > 1 and tries[1][1] == meilleur_score:
        return None
    return meilleur_numero


def _lire_zone_numero(image, avertissements, numeros_a_ignorer=()):
    """Lit le tampon de quatre chiffres en tête du document avec OCR dédié."""
    if not _MOTEUR_DISPONIBLE:
        return ""
    try:
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:  # noqa: BLE001
            pass
        couleur = image.convert("RGB")
        # Le tampon est dans l'en-tête ; ne pas chercher dans le corps de la décision.
        zone = couleur.crop((0, 0, couleur.width, max(1, int(couleur.height * 0.32))))
        if zone.width < LARGEUR_MIN_PIXELS:
            facteur = LARGEUR_MIN_PIXELS / max(zone.width, 1)
            zone = zone.resize(
                (LARGEUR_MIN_PIXELS, max(1, round(zone.height * facteur))), Image.LANCZOS
            )

        rouge, vert, bleu = (zone.getchannel(canal) for canal in ("R", "G", "B"))
        # Une encre rouge/bleue peut disparaître en niveaux de gris. Les différences
        # de canaux isolent le tampon coloré ; les canaux simples couvrent les tampons noirs.
        variantes = []
        for avant, apres in ((rouge, vert), (rouge, bleu), (bleu, rouge), (bleu, vert), (vert, rouge)):
            difference = ImageChops.difference(avant, apres)
            variantes.append(ImageOps.autocontrast(ImageOps.invert(difference)))
        variantes.extend([
            ImageOps.autocontrast(zone.convert("L")),
            ImageOps.autocontrast(rouge),
            ImageOps.autocontrast(vert),
            ImageOps.autocontrast(bleu),
        ])
        langue = _langues_ocr(avertissements)
        essais = []
        numeros_a_ignorer = set(numeros_a_ignorer or ())
        for variante in variantes:
            for config in ("--psm 11", "--psm 6", "--psm 7"):
                try:
                    reconnu = pytesseract.image_to_string(variante, lang=langue, config=config) or ""
                except Exception as exc:  # noqa: BLE001 - une variante défaillante ne bloque pas l'OCR
                    logger.debug("Échec OCR du tampon (%s) : %s", config, type(exc).__name__)
                    essais.append([])
                    continue
                candidats = [
                    candidat for candidat in _candidats_numero_tamponne(reconnu)
                    if candidat not in numeros_a_ignorer
                ]
                essais.append(candidats)
        return _choisir_numero_par_consensus(essais) or ""
    except Exception as exc:  # noqa: BLE001 - l'OCR du numéro ne doit pas bloquer la lecture
        logger.info("Numéro tamponné non reconnu dans l'en-tête : %s", type(exc).__name__)
        return ""


def _avec_zone_numero(texte, numero, numero_page):
    """Ajoute une référence dédiée, prioritaire dans l'extraction finale, si l'en-tête l'a reconnue."""
    numero = (numero or "").strip()
    if not numero or numero_page != 1:
        return texte
    return f"{texte or ''}\n\n[[NUMERO_DECISION_OCR]]{numero}[[/NUMERO_DECISION_OCR]]".strip()


def _avec_zone_cachet(texte, texte_cachet, numero_page):
    """Ajoute un bloc séparé pour ne pas confondre l'OCR du cachet avec le corps de décision."""
    texte_cachet = (texte_cachet or "").strip()
    if not texte_cachet:
        return texte
    return (
        f"{texte or ''}\n\n[[CACHET_OCR_PAGE_{numero_page}]]\n"
        f"{texte_cachet}\n[[/CACHET_OCR]]"
    ).strip()


# --------------------------------------------------------------------------- #
#  Lecture des fichiers
# --------------------------------------------------------------------------- #


def _octets(fichier_scan):
    """Contenu binaire d'un chemin, d'un champ fichier Django ou d'un fichier téléversé."""
    chemin = None
    try:
        chemin = getattr(fichier_scan, "path", None)
    except (ValueError, NotImplementedError):  # champ fichier vide ou stockage distant
        chemin = None
    if chemin is None and isinstance(fichier_scan, (str, Path)):
        chemin = str(fichier_scan)

    if chemin:
        return Path(chemin).read_bytes()

    if hasattr(fichier_scan, "read"):
        contenu = fichier_scan.read()
        try:
            fichier_scan.seek(0)  # l'appelant doit pouvoir relire le flux
        except (AttributeError, OSError):
            pass
        return contenu
    return b""


def _numeros_titre_imprimes(texte_natif):
    """Renvoie les nombres explicitement imprimés après « DÉCISION N° ».

    Un PDF textuel peut contenir un numéro dans son titre, mais cela ne prouve pas
    qu'il s'agit des quatre chiffres du cachet. Ces nombres sont exclus de l'OCR
    de l'en-tête afin qu'un éventuel cachet distinct (ex. 2205 au lieu de 2048)
    reste détectable. En cas de numéro identique au titre, on privilégie la saisie
    manuelle plutôt que de prétendre avoir reconnu le cachet.
    """
    motif = re.compile(
        r"\bD[ÉE]CISION\b[^\r\n]{0,30}?\b(?:N\s*[°ºo.]?|NUM[ÉE]RO)"
        r"\s*[:：#-]?\s*(\d{4})(?!\d)",
        re.IGNORECASE,
    )
    numeros = set()
    for ligne in (texte_natif or "").replace("\r", "\n").splitlines():
        trouve = motif.search(ligne)
        if trouve:
            numeros.add(trouve.group(1))
    return numeros


def _lire_pdf(contenu, avertissements):
    """Combine le texte natif et l'OCR pleine page pour ne pas rater les champs en image."""
    if fitz is None:
        avertissements.append("PyMuPDF n'est pas installé : impossible de lire les PDF.")
        return ""

    textes = []
    document = fitz.open(stream=contenu, filetype="pdf")
    try:
        if document.page_count > PAGES_MAX:
            avertissements.append(f"Seules les {PAGES_MAX} premières pages ont été lues.")
        for numero, page in enumerate(document):
            if numero >= PAGES_MAX:
                break
            natif = (page.get_text("text") or "").strip()
            texte_ocr = ""
            texte_cachet = ""
            numero_decision = ""

            if _MOTEUR_DISPONIBLE:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(ZOOM_PDF, ZOOM_PDF), alpha=False)
                with Image.open(io.BytesIO(pixmap.tobytes("png"))) as image:
                    # OCR de toute la page : les champs peuvent être des images même si le titre
                    # ou le pied de page possède du texte sélectionnable.
                    texte_ocr = _lire_image(image, avertissements).strip()
                    texte_cachet = _lire_zone_cachet(image, avertissements)
                    # Le numéro encadré de l'en-tête peut être manqué par l'OCR pleine page.
                    numero_decision = (
                        _lire_zone_numero(
                            image, avertissements,
                            numeros_a_ignorer=_numeros_titre_imprimes(natif),
                        )
                        if numero == 0 else ""
                    )
            elif len(natif) < SEUIL_TEXTE_NATIF:
                avertissements.append(
                    "Page scannée détectée mais Tesseract/Pillow ne sont pas installés."
                )
            else:
                avertissements.append(
                    "Le texte natif du PDF a été lu, mais Tesseract/Pillow est requis pour lire les champs ou cachets en image."
                )

            # Garder le texte PDF natif en premier pour préserver les valeurs exactes et ajouter
            # l'OCR en complément ; cela évite de perdre une rubrique qui n'existerait qu'en image.
            morceaux = []
            if natif:
                morceaux.append(natif)
            if texte_ocr and texte_ocr.strip() != natif.strip():
                morceaux.append(texte_ocr)
            page_texte = "\n\n".join(morceaux)
            page_texte = _avec_zone_cachet(page_texte, texte_cachet, numero + 1)
            page_texte = _avec_zone_numero(page_texte, numero_decision, numero + 1)
            if page_texte.strip():
                textes.append(page_texte)
    finally:
        document.close()
    return "\n\n".join(textes)


def _lire_image_fichier(contenu, avertissements):
    if not _MOTEUR_DISPONIBLE:
        avertissements.append(
            "Pillow ou pytesseract n'est pas installé : impossible de lire une image."
        )
        return ""
    textes = []
    with Image.open(io.BytesIO(contenu)) as image:
        for numero, page in enumerate(ImageSequence.Iterator(image)):  # TIFF multi-pages
            if numero >= PAGES_MAX:
                break
            copie = page.copy()
            texte_page = _lire_image(copie, avertissements).strip()
            texte_cachet = _lire_zone_cachet(copie, avertissements)
            numero_decision = _lire_zone_numero(copie, avertissements) if numero == 0 else ""
            texte_page = _avec_zone_cachet(texte_page, texte_cachet, numero + 1)
            textes.append(_avec_zone_numero(texte_page, numero_decision, numero + 1))
    return "\n\n".join(t for t in textes if t)


def _lire_texte(fichier_scan, avertissements) -> str:
    """Texte brut du scan. Toute erreur est consignée dans `avertissements`."""
    try:
        contenu = _octets(fichier_scan)
        if not contenu:
            avertissements.append("Le fichier est vide ou illisible.")
            return ""

        tesseract = _configurer_tesseract() if _MOTEUR_DISPONIBLE else None

        if contenu.startswith(b"%PDF-"):
            texte = _lire_pdf(contenu, avertissements)
        else:
            texte = _lire_image_fichier(contenu, avertissements)

        if not texte.strip() and not tesseract:
            avertissements.append(
                "Tesseract est introuvable : installez-le ou définissez la variable "
                "d'environnement TESSERACT_CMD avec le chemin de tesseract.exe."
            )
        return texte
    except Exception as exc:  # noqa: BLE001 - un scan illisible ne doit pas bloquer la RH
        if pytesseract is not None and isinstance(exc, pytesseract.TesseractNotFoundError):
            avertissements.append(
                "Tesseract est introuvable : installez-le ou définissez la variable "
                "d'environnement TESSERACT_CMD avec le chemin de tesseract.exe."
            )
        else:
            logger.warning("Scan de décision illisible : %s", exc)
            avertissements.append(f"Le document n'a pas pu être lu ({type(exc).__name__}).")
        return ""


# --------------------------------------------------------------------------- #
#  Extraction des champs
# --------------------------------------------------------------------------- #


def _premier(motif, texte, defaut=None):
    trouve = motif.search(texte or "")
    return trouve.group(1).strip() if trouve else defaut


def _extraire_im(texte):
    brut = _premier(_MOTIF_IM, texte)
    return re.sub(r"\D", "", brut) if brut else None


def _normaliser_numero_decision(valeur):
    """Fusionne les chiffres espacés mais conserve les suffixes administratifs /DSI/2026."""
    valeur = (valeur or "").strip()
    match = re.match(r"(?P<chiffres>[0-9 .\t]+?)(?P<suffixe>(?:[ \t]*/[ \t]*[A-Za-z0-9.-]+){0,2})$", valeur)
    if not match:
        return re.sub(r"\s+", "", valeur) or None
    chiffres = re.sub(r"\D", "", match.group("chiffres"))
    suffixe = re.sub(r"[ \t]*/[ \t]*", "/", match.group("suffixe"))
    return f"{chiffres}{suffixe}" if chiffres else None


def _extraire_numero_decision(texte):
    """Retourne exclusivement le numéro issu de l'OCR dédié du cachet en en-tête.

    Ne jamais retomber sur « DECISION N° ... » ou un nombre du texte courant :
    ces valeurs peuvent être une référence imprimée différente du numéro tamponné.
    Si le cachet n'est pas assez lisible, le champ reste vide pour vérification RH.
    """
    texte = texte or ""
    # Examiner tous les marqueurs : un candidat illisible/millésimé ne doit pas
    # empêcher l'utilisation d'un autre marqueur valide présent dans le document.
    for marque in _MOTIF_NUMERO_MARQUE.finditer(texte):
        candidat = _extraire_numero_tamponne(marque.group(1))
        if candidat:
            return candidat
    return None


def _extraire_indice(texte):
    """Retourne l'indice en conservant son suffixe alphanumérique éventuel."""
    trouve = _MOTIF_INDICE.search(texte or "")
    if not trouve:
        return None
    nombre = trouve.group("nombre")
    suffixe = trouve.group("suffixe")
    return f"{nombre} {suffixe.upper()}" if suffixe else nombre


def _extraire_annees(texte):
    """Retourne chaque année de titre distincte, y compris chaque année d'une plage 2022-2023."""
    annees = set()
    for trouve in _MOTIF_ANNEES.finditer(texte or ""):
        liste = trouve.group("liste")
        morceaux = list(re.finditer(_ANNEE, liste))
        valeurs = [int(m.group(0)) for m in morceaux]
        annees.update(valeurs)
        # Une plage (« 2022-2023 », « 2022 à 2024 ») représente chaque année incluse.
        # Les listes (« 2022 et 2024 ») restent des années explicitement sélectionnées.
        for precedent, suivant in zip(morceaux, morceaux[1:]):
            separateur = liste[precedent.end():suivant.start()]
            est_plage = bool(re.search(r"(?:-|–|—|\bà\b|\bau\b)", separateur, re.IGNORECASE))
            debut, fin = int(precedent.group(0)), int(suivant.group(0))
            if est_plage and 0 < fin - debut <= 10:
                annees.update(range(debut, fin + 1))
    return sorted(annees)


# Les champs ci-dessous sont complétés de façon conservatrice : l'OCR ne doit
# pas deviner une valeur budgétaire ou une date à partir d'un nombre isolé.
_MOIS_FR = {
    "janvier": 1, "janv": 1, "fevrier": 2, "février": 2, "fevr": 2,
    "mars": 3, "avril": 4, "avr": 4, "mai": 5, "juin": 6,
    "juillet": 7, "juil": 7, "aout": 8, "août": 8,
    "septembre": 9, "sept": 9, "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11, "decembre": 12, "décembre": 12, "dec": 12,
}
_MOTIF_DATE_NUMERIQUE = re.compile(
    r"(?<!\d)(?P<date>(?:\d{4}[ \t]*[./-][ \t]*\d{1,2}[ \t]*[./-][ \t]*\d{1,2}|"
    r"\d{1,2}[ \t]*[./-][ \t]*\d{1,2}[ \t]*[./-][ \t]*\d{2,4}))(?!\d)"
)
# Tesseract peut perdre « / » et retourner « 12 03 2026 » ; cette forme n'est
# utilisée que près d'un libellé de date, jamais comme extraction générique du document.
_MOTIF_DATE_SANS_SEPARATEUR = re.compile(
    r"(?<!\d)(?P<date>\d{1,2}[ \t]+\d{1,2}[ \t]+\d{4})(?!\d)"
)
_MOTIF_DATE_FRANCAISE = re.compile(
    r"\b(?P<jour>\d{1,2})(?:er)?\s+(?P<mois>janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\s+(?P<annee>\d{4})\b",
    re.IGNORECASE,
)


def _date_iso_depuis_texte(texte):
    """Convertit en ISO une date numérique ou française, y compris un OCR avec séparateurs perdus."""
    texte = (texte or "").replace(" ", " ")
    candidats = []
    for motif, type_date in (
        (_MOTIF_DATE_NUMERIQUE, "numerique"),
        (_MOTIF_DATE_SANS_SEPARATEUR, "espaces"),
    ):
        for trouve in motif.finditer(texte):
            candidats.append((trouve.start(), type_date, trouve.group("date")))

    # Respecter l'ordre d'apparition, mais poursuivre si une date candidate est impossible.
    for _, type_date, brut in sorted(candidats, key=lambda item: item[0]):
        morceaux = re.split(r"[./-]", re.sub(r"[ 	]+", "", brut)) if type_date == "numerique" else re.split(r"[ 	]+", brut.strip())
        try:
            if len(morceaux[0]) == 4:
                annee, mois, jour = map(int, morceaux)
            else:
                jour, mois, annee = map(int, morceaux)
                if annee < 100:
                    annee += 2000 if annee <= 69 else 1900
            return date_type(annee, mois, jour).isoformat()
        except (ValueError, TypeError):
            continue

    mois_prefixes = {
        "jan": 1, "fev": 2, "fév": 2, "mar": 3, "avr": 4,
        "mai": 5, "jun": 6, "jui": 7, "aou": 8, "aoû": 8,
        "sep": 9, "oct": 10, "nov": 11, "dec": 12, "déc": 12,
    }
    for trouve in _MOTIF_DATE_FRANCAISE.finditer(texte):
        mois_brut = trouve.group("mois").lower().replace("é", "e").replace("û", "u")
        mois = next(
            (numero for nom, numero in _MOIS_FR.items()
             if mois_brut == nom.lower().replace("é", "e").replace("û", "u")),
            None,
        )
        if mois is None:
            mois = next((n for prefixe, n in mois_prefixes.items() if mois_brut.startswith(prefixe)), None)
        if mois is not None:
            try:
                return date_type(int(trouve.group("annee")), mois, int(trouve.group("jour"))).isoformat()
            except ValueError:
                continue
    return None


def _date_apres_libelle(texte, motif_libelle):
    """Cherche une date liée à son libellé sans emprunter celle d'un champ voisin."""
    texte = (texte or "").replace("\r\n", "\n").replace("\r", "\n")
    motif_ligne = motif_libelle.replace(r"\s+", r"[ \t]+").replace(r"\s*", r"[ \t]*")
    motif = re.compile(motif_ligne, re.IGNORECASE)
    lignes = texte.split("\n")
    offsets = []
    offset = 0
    for ligne in lignes:
        offsets.append(offset)
        offset += len(ligne) + 1

    mois = (
        r"janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|"
        r"juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?"
    )
    motif_fragment_date = re.compile(rf"\d|\b(?:{mois})\b", re.IGNORECASE)

    for trouve in motif.finditer(texte):
        index_ligne = max(i for i, debut in enumerate(offsets) if debut <= trouve.start())
        fin_ligne = texte.find("\n", trouve.end())
        if fin_ligne < 0:
            fin_ligne = len(texte)

        # Ne pas lire au-delà du prochain libellé si le scan a aplati plusieurs champs
        # sur une seule ligne : sinon la date de référence peut devenir la date d'émission.
        fin_valeur = fin_ligne
        reste_ligne = texte[trouve.end():fin_ligne]
        prochain_champ = _DEBUT_LIBELLE_CHAMP.search(reste_ligne)
        if prochain_champ:
            fin_valeur = trouve.end() + prochain_champ.start()
        date_iso = _date_iso_depuis_texte(texte[trouve.end():fin_valeur])
        if date_iso:
            return date_iso

        # Le libellé peut être seul, avec la date séparée sur 1 à 3 lignes par l'OCR.
        accumule = []
        bruits_vides = 0
        for suivante in lignes[index_ligne + 1:index_ligne + 5]:
            suivante = suivante.strip()
            if not suivante:
                continue
            if _ligne_est_libelle(suivante) or re.match(
                r"^(?:date\b|budget\b|imputation\b|chapitre\b|indice\b|"
                r"signataire\b|signature\b|d[ée]tails?\b|nombre\s+de\s+jours\b|"
                r"agent\b|personnel\b|corps\b|grade\b|ann[ée]es?\b)",
                suivante,
                re.IGNORECASE,
            ):
                break
            # Tolérer une courte ligne de pointillés mais ne jamais traverser une ligne
            # de texte ordinaire pour récupérer une date sans rapport.
            if not motif_fragment_date.search(suivante):
                if not re.fullmatch(r"[.·…:_=\-—\s]+", suivante):
                    break
                bruits_vides += 1
                if bruits_vides > 1:
                    break
                continue
            accumule.append(suivante)
            date_iso = _date_iso_depuis_texte(" ".join(accumule))
            if date_iso:
                return date_iso
            if len(accumule) >= 3:
                break
    return None


_DEBUT_LIBELLE_CHAMP = re.compile(
    r"\b(?:date[ \t]+d['’]?[ \t]*[ée]mission|date[ \t]+d['’]?[ \t]*[ée]tablissement|"
    r"date[ \t]+de[ \t]+demande[ \t]+de[ \t]+r[ée]f[ée]rence|date[ \t]+de[ \t]+r[ée]f[ée]rence|"
    r"imputation(?:[ \t]+budg[ée]taire)?(?:[ \t]*/[ \t]*chapitre(?:[ \t]+officiel)?)?|"
    r"chapitre(?:[ \t]+budg[ée]taire)?(?:[ \t]+officiel)?|"
    r"budget|corps(?:[ \t]*(?:/|et|[-–])[ \t]*grade)?|grade|indice|"
    r"ann[ée]es?[ \t]+au[ \t]+titre|"
    r"ann[ée]es?[ \t]+du[ \t]+cong[ée]|d[ée]tails?[ \t]+(?:des?[ \t]+)?jours|"
    r"nombre[ \t]+de[ \t]+jours|dur[ée]e[ \t]+du[ \t]+cong[ée]|"
    r"agent[ \t]+concern[ée]|personnel[ \t]+concern[ée]|b[ée]n[ée]ficiaire|"
    r"nom[ \t]+et[ \t]+pr[ée]noms|signature(?:[ \t]+de[ \t]+la[ \t]+direction)?|signataire|matricule|immatriculation|"
    r"(?:d[ée]cision[ \t]+)?n[°ºo])\b",
    re.IGNORECASE,
)


def _nettoyer_valeur_champ(valeur, limite=140):
    """Retire séparateurs et libellés suivants sans déformer la valeur reconnue."""
    valeur = re.sub(r"\s+", " ", valeur or "").strip(" \t:：=–—-;,.")
    if not valeur:
        return None
    # Un scan ou un PDF peut placer plusieurs champs sur une même ligne.
    prochaines = [m.start() for m in _DEBUT_LIBELLE_CHAMP.finditer(valeur) if m.start() > 0]
    if prochaines:
        valeur = valeur[:min(prochaines)].strip(" \t:：=–—-;,.")
    if not valeur or re.fullmatch(r"[:：=–—;,.-]+", valeur):
        return None
    return valeur[:limite]


def _ligne_est_libelle(ligne):
    return bool(_DEBUT_LIBELLE_CHAMP.match((ligne or "").strip()))


def _valeur_apres_libelle(texte, motif_libelle, limite=140):
    """Lit une valeur sur la même ligne ou la suivante sans avaler le libellé suivant."""
    texte = (texte or "").replace("\r\n", "\n").replace("\r", "\n")
    # Les libellés se trouvent sur une ligne : convertir les espaces regex en espaces
    # horizontaux pour qu'une recherche ne saute jamais par-dessus un saut de ligne.
    motif_ligne = motif_libelle.replace(r"\s+", r"[ \t]+").replace(r"\s*", r"[ \t]*")
    motif = re.compile(motif_ligne + r"[ \t]*[:：=]?[ \t]*(?P<valeur>[^\r\n]*)", re.IGNORECASE)
    lignes = texte.split("\n")
    offsets = []
    offset = 0
    for ligne in lignes:
        offsets.append(offset)
        offset += len(ligne) + 1

    for trouve in motif.finditer(texte):
        index_ligne = max(i for i, debut in enumerate(offsets) if debut <= trouve.start())
        fin_ligne = texte.find("\n", trouve.end())
        if fin_ligne < 0:
            fin_ligne = len(texte)
        # Le groupe contient le reste de la ligne après le libellé ; ne pas prendre
        # le segment après le groupe, qui serait vide et ferait perdre la valeur.
        valeur = _nettoyer_valeur_champ(trouve.group("valeur"), limite)
        if valeur:
            return valeur

        # Le libellé se termine seul sur sa ligne. Lire la première ligne non vide,
        # mais ne jamais prendre un autre libellé comme s'il s'agissait de la valeur.
        for suivante in lignes[index_ligne + 1:index_ligne + 4]:
            suivante = suivante.strip()
            if not suivante:
                continue
            if _ligne_est_libelle(suivante):
                break
            valeur = _nettoyer_valeur_champ(suivante, limite)
            if valeur:
                return valeur
            break
    return None


def _extraire_budget(texte):
    valeur = _valeur_apres_libelle(texte, r"\bbudget\b", limite=100)
    if valeur:
        if valeur.strip().lower() in {"général", "general", "budget général", "budget general"}:
            return "Budget Général"
        return valeur
    # Repli sur la formulation complète si le texte a été extrait depuis une ligne en colonnes.
    trouve = re.search(r"\bbudget\s+g[ée]n[ée]ral\b", texte or "", re.IGNORECASE)
    return "Budget Général" if trouve else None


def _extraire_imputation(texte):
    return _valeur_apres_libelle(
        texte,
        r"\b(?:imputation(?:\s+budg[ée]taire)?(?:\s*/\s*chapitre(?:\s+officiel)?)?|"
        r"chapitre(?:\s+budg[ée]taire)?(?:\s+officiel)?)\b",
        limite=140,
    )


def _extraire_details_jours(texte):
    """Retourne uniquement la durée (ex. « 30 jours »), jamais des dates de période."""
    texte_normalise = (texte or "").replace("\r\n", "\n").replace("\r", "\n")
    labels = re.compile(
        r"\b(?:d[ée]tails?\s+(?:des?\s+)?jours|d[ée]compte\s+(?:des?\s+)?jours|"
        r"nombre\s+de\s+jours(?:\s+(?:accord[ée]s?|attribu[ée]s?|demand[ée]s?|pris))?|"
        r"jours\s+(?:accord[ée]s?|demand[ée]s?)|dur[ée]e\s+du\s+cong[ée]|"
        r"p[ée]riode\s+(?:de\s+)?cong[ée]|d[ée]tail\s+du\s+cong[ée])\b",
        re.IGNORECASE,
    )
    motif_duree = re.compile(
        r"(?<![A-Za-z0-9/.-])(?P<nombre>\d{1,3}|[0-9O]{1,3})[ \t]*"
        r"(?P<unite>jours?|jrs?\.?|j\b)(?![A-Za-z])",
        re.IGNORECASE,
    )

    def normaliser_duree(segment):
        trouve = motif_duree.search(segment or "")
        if not trouve:
            return None
        chiffres = trouve.group("nombre").upper().replace("O", "0")
        if not chiffres.isdigit():
            return None
        nombre = int(chiffres)
        if nombre <= 0 or nombre > 999:
            return None
        return f"{nombre} jour" if nombre == 1 else f"{nombre} jours"

    lignes = texte_normalise.split("\n")
    # Priorité aux rubriques dédiées pour éviter de prendre une durée mentionnée
    # ailleurs dans une référence ou dans un autre paragraphe.
    for trouve in labels.finditer(texte_normalise):
        fin_ligne = texte_normalise.find("\n", trouve.end())
        if fin_ligne < 0:
            fin_ligne = len(texte_normalise)
        meme_ligne = texte_normalise[trouve.end():fin_ligne]
        duree = normaliser_duree(meme_ligne)
        if duree:
            return duree

        # Un formulaire peut séparer le libellé et la valeur (« Détails des jours » puis « 30 »).
        apres = meme_ligne.strip(" \t:：=.-")
        if re.fullmatch(r"\d{1,3}", apres):
            nombre = int(apres)
            if 0 < nombre <= 999:
                return f"{nombre} jour" if nombre == 1 else f"{nombre} jours"

        # Lire au plus deux lignes suivantes ; arrêter sur un autre champ ou sur une période.
        for ligne in lignes[texte_normalise[:trouve.start()].count("\n") + 1:][:3]:
            candidate = ligne.strip()
            if not candidate:
                continue
            if _ligne_est_libelle(candidate) or re.match(
                r"^(?:du|debut|début|fin|au|date\b|fait\s+[àa]\b|"
                r"budget\b|imputation\b|chapitre\b|indice\b|signataire\b|"
                r"signature\b|agent\b|personnel\b|corps\b|grade\b|"
                r"num[ée]ro\b|n[°ºo]\b|au\s+titre\b)",
                candidate,
                re.IGNORECASE,
            ):
                break
            duree = normaliser_duree(candidate)
            if duree:
                return duree
            # Une valeur seule n'est acceptée que si c'est simplement un nombre,
            # jamais une date du type 02/03/2026.
            valeur_nue = candidate.strip(" \t:：=.-")
            if re.fullmatch(r"\d{1,3}", valeur_nue):
                nombre = int(valeur_nue)
                if 0 < nombre <= 999:
                    return f"{nombre} jour" if nombre == 1 else f"{nombre} jours"
            break

    # Dernier recours : une durée explicite n'importe où dans le document. Ne jamais
    # produire de période « du ... au ... » à partir de dates reconnues.
    duree = normaliser_duree(texte_normalise)
    if duree:
        return duree
    return None


def _extraire_corps_grade(texte):
    valeur = _valeur_apres_libelle(
        texte,
        r"\bcorps\s*(?:/|et|[-–])\s*grade\b",
        limite=180,
    )
    if valeur:
        return valeur
    corps = _valeur_apres_libelle(texte, r"\bcorps\b", limite=100)
    grade = _valeur_apres_libelle(texte, r"\bgrade\b", limite=100)
    if corps and grade:
        return f"{corps} / {grade}"[:180]
    return corps or grade


def _extraire_agent_concerne(texte):
    valeur = _valeur_apres_libelle(
        texte,
        r"\b(?:agent\s+concern[ée]|personnel\s+concern[ée]|agent\s+b[ée]n[ée]ficiaire|"
        r"nom\s+complet\s+de\s+l['’]?agent|nom\s+et\s+pr[ée]noms|b[ée]n[ée]ficiaire)\b",
        limite=180,
    )
    if not valeur:
        return None
    valeur = re.sub(r"^(?:M(?:me|lle|r)?\.?|Madame|Monsieur|Agent)\s+", "", valeur, flags=re.IGNORECASE)
    valeur = re.split(r"\b(?:IM|I\.?M\.?|matricule|direction|service|statut)\b", valeur, maxsplit=1, flags=re.IGNORECASE)[0]
    valeur = re.sub(r"\s+", " ", valeur).strip(" ,;:-")
    return valeur[:180] or None


def _extraire_date_emission(texte):
    """Extrait la date d'émission à partir d'un libellé ou d'une formule administrative datée."""
    motifs = (
        r"\b(?:date\s+d['’]?[ \t]*[ée]mission|date[ \t]+[ée]mission|"
        r"date\s+d['’]?[ \t]*[ée]tablissement|date[ \t]+[ée]tablissement|"
        r"date\s+d['’]?[ \t]*[ée]dition|date[ \t]+[ée]dition|"
        r"date\s+de\s+la\s+d[ée]cision)\b",
        r"\b(?:[ée]mis[e]?|[ée]tabli[e]?|d[ée]livr[ée]e?)\s+le\b",
        r"\bfait\s+[àa]\b[^\r\n]{0,120}?\ble\b",
        r"\b(?:antananarivo|tananarive|madagascar)\b[^\r\n]{0,100}?\ble\b",
    )
    for motif in motifs:
        valeur = _date_apres_libelle(texte, motif)
        if valeur:
            return valeur
    return None


def _extraire_date_demande_reference(texte):
    """Extrait une date de demande/référence seulement lorsqu'un libellé explicite l'identifie."""
    motifs = (
        r"\b(?:date\s+de\s+demande\s+de\s+r[ée]f[ée]rence|"
        r"date\s+de\s+r[ée]f[ée]rence|date\s+de\s+la\s+demande|"
        r"date\s+demand[eé]\s+(?:de\s+)?r[ée]f[ée]rence|"
        r"date\s+r[ée]f[ée]rence|date\s+demande\s+ref(?:[ée]rence)?|"
        r"date\s+de\s+la\s+demand[eé])\b",
        r"\b(?:demande|r[ée]f[ée]rence)\s+(?:de\s+)?(?:cong[ée]\s+)?"
        r"(?:en\s+date\s+du|dat[ée]e?\s+du|du)\b",
        r"\b(?:demande\s+de\s+cong[ée]|demande)\s+(?:dat[ée]e?\s+du|en\s+date\s+du)\b",
        r"\b(?:r[ée]f(?:[ée]rence)?\.?|demande)\s*[:#-]\s*",
    )
    for motif in motifs:
        valeur = _date_apres_libelle(texte, motif)
        if valeur:
            return valeur
    return None


def _nettoyer_ligne_cachet(ligne):
    """Nettoie les caractères de bruit sans inventer le nom ou la fonction."""
    ligne = re.sub(r"[^\wÀ-ÿ\s'’.,()/-]", " ", ligne or "", flags=re.UNICODE)
    return re.sub(r"\s+", " ", ligne).strip(" \t.,;:-_")


def _normaliser_fonction_cachet(ligne):
    """Normalise les variantes OCR d'une fonction administrative, sans valider une identité."""
    ligne = _nettoyer_ligne_cachet(ligne)
    # Le cachet de référence et certains scans dégradés lisent « Directeur » comme
    # « Ypettour »/« Ypetteur ». Si « des Ressources Humaines » est lisible et qu'un
    # token ressemble à cette variante OCR, proposer la fonction canonique.
    if re.search(r"\bressources\s+humaines\b", ligne, re.IGNORECASE):
        prefixe = ligne.split("ressources", 1)[0]
        if re.search(r"\b(?:directeur(?:rice)?|ypett?eur|ypettour|ypetteur)\b", prefixe, re.I):
            return "DIRECTEUR DES RESSOURCES HUMAINES"
    return ligne


def _score_fonction_signataire(ligne, index):
    """Favorise la fonction délégataire la plus spécifique et la plus basse du cachet."""
    normalisee = _normaliser_fonction_cachet(ligne).upper()
    if "DIRECTEUR DES RESSOURCES HUMAINES" in normalisee:
        rang = 100
    elif re.search(r"\bdirect(?:eur|rice)\b", normalisee):
        rang = 80
    elif re.search(r"\bchef\b", normalisee):
        rang = 65
    elif re.search(r"\bsecr[ée]taire\s+g[ée]n[ée]ral", normalisee):
        rang = 50
    elif re.search(r"\bministre\b", normalisee):
        rang = 10
    else:
        rang = 30
    return rang, index


def _est_ligne_nom_cachet(ligne):
    """Écarte les restes de chaîne de délégation et privilégie un nom/prénom plausible."""
    ligne = _nettoyer_ligne_cachet(ligne)
    if not ligne or len(ligne) > 75:
        return False
    if _MOTIFS_CACHEt_INSTITUTIONNELS.search(ligne):
        return False
    if _MOTIF_LIGNE_NON_NOM.search(ligne) or _MOTIF_FONCTION_SIGNATAIRE.search(ligne):
        return False
    mots = re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-]*", ligne)
    if not 2 <= len(mots) <= 5:
        return False
    # Écarte les lignes de bruit à dominante minuscule (souvent le paraphe OCRisé).
    mots_avec_lettre = [mot for mot in mots if len(mot) >= 3]
    return len(mots_avec_lettre) >= 2


def _extraire_signataire(texte_cachet):
    """Propose fonction et nom depuis le cachet en privilégiant la délégation finale.

    Le résultat reste une suggestion OCR : la RH doit confirmer l'orthographe du nom.
    """
    lignes = [_nettoyer_ligne_cachet(ligne) for ligne in (texte_cachet or "").splitlines()]
    lignes = [ligne for ligne in lignes if len(re.sub(r"\W", "", ligne)) >= 3]
    if not lignes:
        return ""

    candidats = []
    for index, ligne in enumerate(lignes):
        fonction = _normaliser_fonction_cachet(ligne)
        if _MOTIF_FONCTION_SIGNATAIRE.search(ligne) or fonction != ligne:
            candidats.append((*_score_fonction_signataire(fonction, index), index, ligne, fonction))
    if not candidats:
        return ""

    # Choisir d'abord la fonction la plus spécifique. En cas d'égalité, prendre
    # la dernière fonction dans la chaîne de délégation plutôt que « P. le Ministre ».
    _, _, index_fonction, ligne_brute, fonction = max(candidats, key=lambda item: (item[0], item[1]))

    nom = ""
    # Le nom est souvent sur la ligne sous le cachet, parfois séparé par une ligne
    # de signature/paraphe. Chercher jusqu'à trois lignes dans chaque direction.
    for distance in range(1, 4):
        for voisin_index in (index_fonction + distance, index_fonction - distance):
            if not (0 <= voisin_index < len(lignes)):
                continue
            voisin = lignes[voisin_index]
            if _est_ligne_nom_cachet(voisin):
                nom = voisin
                break
        if nom:
            break

    # La fonction canonique est utilisée si l'OCR a très déformé son libellé.
    resultat_fonction = fonction if fonction != ligne_brute else ligne_brute
    resultat = f"{resultat_fonction} — {nom}" if nom else resultat_fonction
    return re.sub(r"\s+", " ", resultat).strip(" —-.,;:")[:150]


def extraire_donnees_decision(fichier_scan):
    """Analyse une décision de congé et renvoie les données extraites.

    Champs : source, im, numero_decision, indice, annees, annees_titre, signataire
    (proposition issue du cachet), texte_cachet, champs_manquants, avertissements, texte_brut.

    `source` vaut OCR si au moins une donnée a été reconnue, sinon SAISIE_MANUELLE.
    """
    avertissements = []
    texte = _lire_texte(fichier_scan, avertissements)

    blocs_cachet = [
        bloc.strip()
        for bloc in _MARQUEUR_CACHET.findall(texte or "")
        if bloc.strip()
    ]
    texte_cachet = "\n".join(blocs_cachet).strip()
    signataire = _extraire_signataire(texte_cachet)
    if not signataire:
        # Certains PDF ont un champ Signataire en texte natif, sans cachet détectable.
        signataire = _valeur_apres_libelle(texte, r"\bsignataire\b", limite=150) or ""

    annees = _extraire_annees(texte)
    donnees = {
        "im": _extraire_im(texte),
        "numero_decision": _extraire_numero_decision(texte),
        "indice": _extraire_indice(texte),
        "annees": annees,
        "signataire": signataire,
        "texte_cachet": texte_cachet,
        # Champs complémentaires du formulaire RH, conservés dans la même structure de réponse.
        "agent_concerne": _extraire_agent_concerne(texte),
        "corps_grade": _extraire_corps_grade(texte),
        "budget": _extraire_budget(texte),
        "imputation_budgetaire": _extraire_imputation(texte),
        "date_emission": _extraire_date_emission(texte),
        "date_demande_reference": _extraire_date_demande_reference(texte),
        "details_jours": _extraire_details_jours(texte),
    }

    manquants = [
        libelle
        for cle, libelle in (
            ("im", "IM"),
            ("numero_decision", "numéro de décision"),
            ("indice", "indice"),
            ("annees", "année(s) au titre"),
        )
        if not donnees[cle]
    ]

    champs_complementaires_manquants = [
        libelle
        for cle, libelle in (
            ("agent_concerne", "agent concerné (correspondance IM/nom)"),
            ("corps_grade", "corps / grade (ou dossier agent)"),
            ("budget", "budget"),
            ("imputation_budgetaire", "imputation budgétaire"),
            ("date_emission", "date d'émission"),
            ("date_demande_reference", "date de demande de référence"),
            ("details_jours", "détails des jours"),
            ("signataire", "signataire / cachet"),
        )
        if not donnees.get(cle)
    ]

    # Une décision peut être reconnue par un champ complémentaire même si l'IM ou
    # l'indice est absent du scan. Ne pas forcer la saisie manuelle si des données utiles existent.
    cles_donnees = (
        "im", "numero_decision", "indice", "annees", "agent_concerne", "corps_grade",
        "budget", "imputation_budgetaire", "date_emission", "date_demande_reference",
        "details_jours", "signataire",
    )
    reconnu = any(bool(donnees.get(cle)) for cle in cles_donnees)
    if texte.strip() and not reconnu:
        avertissements.append(
            "Le texte a été lu mais aucune donnée n'a été reconnue : saisie manuelle requise."
        )
    if not signataire:
        if texte_cachet:
            avertissements.append(
                "Le cachet a été lu, mais le nom et la fonction n'ont pas pu être isolés avec fiabilité. Vérifiez le signataire manuellement."
            )
        else:
            avertissements.append(
                "Le nom et la fonction du cachet n'ont pas été reconnus automatiquement. Vérifiez le signataire manuellement."
            )
    else:
        avertissements.append(
            "Le signataire proposé a été lu dans le cachet : confirmez son orthographe avant l'enregistrement."
        )

    return {
        "source": "OCR" if reconnu else "SAISIE_MANUELLE",
        **donnees,
        "annees_titre": ", ".join(str(a) for a in annees),
        "champs_manquants": manquants,
        "champs_complementaires_manquants": champs_complementaires_manquants,
        "avertissements": avertissements,
        "texte_brut": texte,
    }