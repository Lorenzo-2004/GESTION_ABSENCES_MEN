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
from pathlib import Path

logger = logging.getLogger(__name__)

# Moteur OCR optionnel : sans lui, seuls les PDF à texte natif sont lisibles.
try:
    import pytesseract
    from PIL import Image, ImageOps, ImageSequence

    _MOTEUR_DISPONIBLE = True
except Exception:  # noqa: BLE001 - dépendance optionnelle
    pytesseract = None
    Image = ImageOps = ImageSequence = None
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
_MOTIF_NUMERO_APRES_TITRE = re.compile(
    r"\bD[ÉE]CISION\s*(?:n[°ºo]\.?|num[ée]ro)\s*[:.]?\s*(\d{1,6})(?!\s*-\s*\d)",
    re.IGNORECASE,
)

# Numéro seul sur la ligne qui précède le titre.
_MOTIF_NUMERO_AVANT_TITRE = re.compile(
    r"\b(\d{1,6})[ \t]*(?:\r?\n[ \t]*)+D[ÉE]CISION\b",
    re.IGNORECASE,
)

# Dernier recours : n'importe quel « N° 123 », sauf s'il cite un texte de référence.
_MOTIF_NUMERO_GENERIQUE = re.compile(
    r"\bn\s*(?:[°º]|o)\s*[:.]?\s*(\d{1,6})(?!\s*[-/]\s*\d)",
    re.IGNORECASE,
)
_TEXTES_DE_REFERENCE = re.compile(
    r"d[ée]cret|arr[êe]t[ée]|loi|ordonnance|circulaire|note|r[ée]f[ée]rence|vu\b",
    re.IGNORECASE,
)

_MOTIF_INDICE = re.compile(r"\bindice\b\s*[:.]?\s*(\d{2,6})(?!\d)", re.IGNORECASE)

# Années de congé : « au titre de l'année 2025 », « au titre des années 2024 et 2025 »,
# « au titre des exercices 2023 à 2025 », « au titre de 2025 ».
_ANNEE = r"(?:19|20)\d{2}"
_MOTIF_ANNEES = re.compile(
    r"\bau\s+titre\s+(?:de\s+l['’]\s*|de\s+la\s+|des\s+|du\s+|de\s+)?"
    r"(?:(?:ann[ée]es?|exercices?)\s*)?:?\s*"
    rf"({_ANNEE}(?:\s*(?:,|;|et|&|/|-|–|à)\s*{_ANNEE})*)",
    re.IGNORECASE,
)

# Mots français courants : sert à juger si le texte reconnu est lisible.
_MOTS_FRANCAIS = re.compile(
    r"\b(?:du|la|le|les|de|des|budget|indice|matricule|jour|jours|annee|année|décision|decision)\b",
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


def _score_lisibilite(texte):
    """Évalue la lisibilité d'un texte reconnu (mots français + caractères utiles)."""
    utile = sum(1 for c in (texte or "") if c.isalnum() or c.isspace())
    return len(_MOTS_FRANCAIS.findall(texte or "")) * 1000 + utile


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
    """Reconnaît le texte d'une image ; ne tourne le document qu'en cas de doute."""
    langue = _langues_ocr(avertissements)
    preparee = _preparer(image)

    meilleur = pytesseract.image_to_string(preparee, lang=langue) or ""
    if len(_MOTS_FRANCAIS.findall(meilleur)) >= SEUIL_LISIBILITE:
        return meilleur

    # Texte peu lisible : le scan est peut-être retourné ou couché.
    for angle in (180, 90, 270):
        essai = pytesseract.image_to_string(
            preparee.rotate(angle, expand=True), lang=langue
        ) or ""
        if _score_lisibilite(essai) > _score_lisibilite(meilleur):
            meilleur = essai
        if len(_MOTS_FRANCAIS.findall(meilleur)) >= SEUIL_LISIBILITE:
            break
    return meilleur


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


def _lire_pdf(contenu, avertissements):
    """Texte natif quand il existe, sinon OCR de la page rendue en image."""
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
            if len(natif) >= SEUIL_TEXTE_NATIF:
                textes.append(natif)
                continue

            if not _MOTEUR_DISPONIBLE:
                avertissements.append(
                    "Page scannée détectée mais Tesseract/Pillow ne sont pas installés."
                )
                textes.append(natif)
                continue
            pixmap = page.get_pixmap(matrix=fitz.Matrix(ZOOM_PDF, ZOOM_PDF), alpha=False)
            with Image.open(io.BytesIO(pixmap.tobytes("png"))) as image:
                textes.append(_lire_image(image, avertissements).strip() or natif)
    finally:
        document.close()
    return "\n\n".join(t for t in textes if t)


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
            textes.append(_lire_image(page.copy(), avertissements).strip())
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


def _extraire_numero_decision(texte):
    """Numéro après le titre DÉCISION, sinon avant le titre, sinon un « N° » isolé."""
    numero = _premier(_MOTIF_NUMERO_APRES_TITRE, texte) or _premier(
        _MOTIF_NUMERO_AVANT_TITRE, texte
    )
    if numero:
        return numero

    for trouve in _MOTIF_NUMERO_GENERIQUE.finditer(texte or ""):
        contexte = (texte[max(0, trouve.start() - 30): trouve.start()]).lower()
        if not _TEXTES_DE_REFERENCE.search(contexte):
            return trouve.group(1)
    return None


def _extraire_annees(texte):
    """Années citées après « au titre de… » ; « 2023 à 2025 » couvre les années du milieu."""
    annees = set()
    for trouve in _MOTIF_ANNEES.finditer(texte or ""):
        liste = trouve.group(1)
        valeurs = [int(a) for a in re.findall(_ANNEE, liste)]
        annees.update(valeurs)
        if re.search(r"\bà\b", liste) and len(valeurs) == 2 and 0 < valeurs[1] - valeurs[0] <= 5:
            annees.update(range(valeurs[0], valeurs[1] + 1))
    return sorted(annees)


def extraire_donnees_decision(fichier_scan):
    """Analyse une décision de congé et renvoie les données extraites.

    Champs : source, im, numero_decision, indice, annees, annees_titre (texte prêt
    à saisir), champs_manquants, avertissements, texte_brut.

    `source` vaut OCR si au moins une donnée a été reconnue, sinon SAISIE_MANUELLE.
    """
    avertissements = []
    texte = _lire_texte(fichier_scan, avertissements)

    annees = _extraire_annees(texte)
    donnees = {
        "im": _extraire_im(texte),
        "numero_decision": _extraire_numero_decision(texte),
        "indice": _premier(_MOTIF_INDICE, texte),
        "annees": annees,
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

    reconnu = len(manquants) < 4
    if texte.strip() and not reconnu:
        avertissements.append(
            "Le texte a été lu mais aucune donnée n'a été reconnue : saisie manuelle requise."
        )

    return {
        "source": "OCR" if reconnu else "SAISIE_MANUELLE",
        **donnees,
        "annees_titre": ", ".join(str(a) for a in annees),
        "champs_manquants": manquants,
        "avertissements": avertissements,
        "texte_brut": texte,
    }