"""
Extraction des données d'une décision de congé à partir d'un scan (RG-05).

Prend en charge :
- Les images JPG et PNG.
- Les PDF contenant du texte sélectionnable.
- Les PDF scannés nécessitant une reconnaissance OCR.
- L'extraction du matricule, du numéro de décision, de l'indice
  et des années de congé.
- Le retour à la saisie manuelle en cas d'échec.
"""

import io
import re
from pathlib import Path

# Moteur OCR optionnel.
try:
    import pytesseract
    from PIL import Image

    _MOTEUR_DISPONIBLE = True

except Exception:
    pytesseract = None
    Image = None
    _MOTEUR_DISPONIBLE = False


# Lecture des PDF avec PyMuPDF.
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


def _chemin_tesseract():
    """Recherche le moteur Tesseract dans les emplacements Windows connus."""

    candidats = [
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path.home()
        / "AppData"
        / "Local"
        / "Programs"
        / "Tesseract-OCR"
        / "tesseract.exe",
    ]

    for candidat in candidats:
        if candidat.is_file():
            return str(candidat)

    # Si Tesseract est accessible par le PATH, pytesseract
    # pourra utiliser sa commande par défaut.
    return None


# Extraction du matricule (IM).
_MOTIF_IM = re.compile(
    r"(?:\bIM\b|matricule)\s*[:.]?\s*(\d[\d. ]{2,18}\d)",
    re.IGNORECASE,
)


# Numéro placé avant le titre DÉCISION.
# Exemple :
# 2205
#
# DECISION N°. .. MEN/SG/DRH
_MOTIF_NUMERO_AVANT_TITRE = re.compile(
    r"\b(\d{1,6})[ \t]*(?:\r?\n[ \t]*)+D[ÉE]CISION\b",
    re.IGNORECASE,
)


# Numéro placé après N°, Nº ou No.
# Exemple : DECISION N° 2205
_MOTIF_DECISION = re.compile(
    r"\bn\s*(?:[°º]|o)\s*[:.]?\s*(\d{1,6})\b",
    re.IGNORECASE,
)


# Indice du personnel.
_MOTIF_INDICE = re.compile(
    r"\bindice\b\s*[:.]?\s*(\d{2,6})",
    re.IGNORECASE,
)


# Années expressément mentionnées comme années de congé.
# Exemple : 30 jours au titre de l'année 2023
_MOTIF_ANNEE = re.compile(
    r"\bau\s+titre\s+de\s+l['’]ann(?:ée|ee)\s*[:\-]?\s*((?:19|20)\d{2})\b",
    re.IGNORECASE,
)


# Mots français permettant de comparer la lisibilité OCR.
_MOTS_FRANCAIS = re.compile(
    r"\b(?:du|la|le|les|de|budget|indice|matricule|jour|annee|année)\b",
    re.IGNORECASE,
)


_LANGUES_OCR = "fra+eng"


def _score_lisibilite(texte):
    """Évalue la lisibilité du texte obtenu par OCR."""

    utile = "".join(
        caractere
        for caractere in (texte or "")
        if caractere.isalnum() or caractere.isspace()
    )

    return (
        len(_MOTS_FRANCAIS.findall(texte or "")) * 1000
        + len(utile)
    )


def _configurer_tesseract():
    """Configure Tesseract lorsque son chemin Windows est connu."""

    tesseract = _chemin_tesseract()

    if tesseract:
        pytesseract.pytesseract.tesseract_cmd = tesseract


def _lire_image(image) -> str:
    """Reconnaît le texte français et anglais d'une image."""

    _configurer_tesseract()

    texte = (
        pytesseract.image_to_string(
            image,
            lang=_LANGUES_OCR,
        )
        or ""
    )

    # Deuxième tentative si le document est retourné.
    texte_tourne = (
        pytesseract.image_to_string(
            image.rotate(180),
            lang=_LANGUES_OCR,
        )
        or ""
    )

    # Garder la version qui semble la plus lisible.
    return max(
        (texte, texte_tourne),
        key=_score_lisibilite,
    )


def _lire_pdf(source, depuis_flux=False) -> str:
    """
    Lit toutes les pages d'un PDF.

    Utilise le texte natif lorsqu'il est suffisamment présent.
    Pour les pages scannées, convertit la page en image et applique l'OCR.
    """

    if fitz is None:
        return ""

    if depuis_flux:
        document = fitz.open(
            stream=source,
            filetype="pdf",
        )
    else:
        document = fitz.open(source)

    textes = []

    try:
        for page in document:

            # Première tentative : extraire le texte natif du PDF.
            texte_natif = (
                page.get_text("text") or ""
            ).strip()

            if len(texte_natif) >= 80:
                textes.append(texte_natif)
                continue

            # Si le PDF est scanné, convertir la page en image.
            try:
                pixmap = page.get_pixmap(
                    matrix=fitz.Matrix(3, 3),
                    alpha=False,
                )

                image = Image.open(
                    io.BytesIO(
                        pixmap.tobytes("png")
                    )
                )

                texte_ocr = _lire_image(image)

            except Exception:
                # Continuer avec le texte natif si cette page
                # ne peut pas être traitée par OCR.
                texte_ocr = ""

            textes.append(
                texte_ocr.strip() or texte_natif
            )

    finally:
        document.close()

    return "\n\n".join(
        texte for texte in textes if texte
    )


def _lire_texte(fichier_scan) -> str:
    """
    Lit une image ou un PDF depuis un chemin ou un fichier téléversé.

    Les fichiers peuvent provenir d'un champ Django ou être transmis
    en mémoire par l'API.
    """

    if not _MOTEUR_DISPONIBLE:
        return ""

    try:
        chemin = getattr(
            fichier_scan,
            "path",
            None,
        )

        # Accepter également un chemin transmis directement.
        if chemin is None and isinstance(
            fichier_scan,
            (str, Path),
        ):
            chemin = str(fichier_scan)

        if chemin:

            # Déterminer si le fichier est un PDF.
            with open(chemin, "rb") as fichier:
                signature = fichier.read(5)

            if signature == b"%PDF-":
                return _lire_pdf(chemin)

            # Sinon, traiter le document comme une image.
            with Image.open(chemin) as image:
                return _lire_image(image)

        # Cas d'un fichier téléversé en mémoire.
        if hasattr(fichier_scan, "read"):

            contenu = fichier_scan.read()

            # Restaurer le flux pour que l'appelant puisse le relire.
            try:
                fichier_scan.seek(0)
            except (AttributeError, OSError):
                pass

            if contenu.startswith(b"%PDF-"):
                return _lire_pdf(
                    contenu,
                    depuis_flux=True,
                )

            with Image.open(
                io.BytesIO(contenu)
            ) as image:
                return _lire_image(image)

        return ""

    except Exception:
        # Un document illisible ne doit pas bloquer la saisie manuelle.
        return ""


def _premier(motif, texte, defaut=None):
    """Renvoie le premier groupe capturé par une expression régulière."""

    trouve = motif.search(texte or "")

    return (
        trouve.group(1).strip()
        if trouve
        else defaut
    )


def _extraire_numero_decision(texte):
    """
    Extrait le numéro de décision.

    Essaie d'abord le numéro situé avant le titre DÉCISION,
    puis le numéro situé après N°.
    """

    numero = _premier(
        _MOTIF_NUMERO_AVANT_TITRE,
        texte,
    )

    if numero is None:
        numero = _premier(
            _MOTIF_DECISION,
            texte,
        )

    return numero


def extraire_donnees_decision(fichier_scan):
    """
    Analyse une décision de congé et renvoie les données extraites.

    Champs :
    - source
    - im
    - numero_decision
    - indice
    - annees
    - texte_brut

    Si le document ne peut pas être lu, les champs sont vides
    et source vaut SAISIE_MANUELLE.
    """

    texte = _lire_texte(fichier_scan)

    # Si la lecture échoue, laisser la RH saisir les informations.
    if not texte.strip():
        return {
            "source": "SAISIE_MANUELLE",
            "im": None,
            "numero_decision": None,
            "indice": None,
            "annees": [],
            "texte_brut": "",
        }

    # Ne récupérer que les années explicitement associées
    # à l'expression « au titre de l'année ».
    annees = sorted({
        int(annee)
        for annee in _MOTIF_ANNEE.findall(texte)
    })

    # Extraction et normalisation du matricule.
    im = _premier(
        _MOTIF_IM,
        texte,
    )

    if im is not None:
        im = im.replace(" ", "").replace(".", "")

    # Le numéro est extrait indépendamment du matricule.
    # Il sera donc récupéré même si l'IM n'est pas reconnu.
    numero_decision = _extraire_numero_decision(
        texte
    )

    # Construire le résultat final.
    return {
        "source": "OCR",
        "im": im,
        "numero_decision": numero_decision,
        "indice": _premier(
            _MOTIF_INDICE,
            texte,
        ),
        "annees": annees,
        "texte_brut": texte,
    }