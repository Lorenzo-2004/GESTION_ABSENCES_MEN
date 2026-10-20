"""Formulaire officiel de demande d'absence, rempli automatiquement (CDC §1.2).

Le document imprimé par l'application **est** le formulaire réglementaire du MEN
(fichier fourni : CONCEPTION/FORMULAIRE.pdf). Ce fichier étant un scan image
(aucun champ de formulaire PDF, aucun texte), il n'est pas reproduit : il est
placé en fond de page, puis les données de l'agent et de la demande sont écrites
par-dessus, aux emplacements des pointillés du document.

Le fond est extrait une fois du PDF original et versionné dans
`conges/ressources/formulaire_fond.png`. La position des valeurs est définie par
`EMPLACEMENTS`, calibrée sur le document réel.
"""

from datetime import date
from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as canvas_lib
from pypdf import PdfReader, PdfWriter
from django.core.exceptions import ValidationError

from ..enums import TypeAbsence
from ..models import DecisionConge

LARGEUR, HAUTEUR = A4  # 595 x 842 points

# Le document fourni est le formulaire lui-même ; il est conservé comme page fond.
FORMULAIRE_SOURCE = (
    Path(__file__).resolve().parent.parent / "ressources" / "formulaire_vierge.pdf"
)

# Police des saisies : proche de la dactylographie du document (Times).
POLICE = "Times-Roman"
TAILLE = 10.5

# --------------------------------------------------------------------------- #
#  Emplacements des valeurs, en points PDF (origine = coin bas-gauche).
#  Relevés sur le formulaire original : chaque entrée donne le x et l'ordonnée
#  de la ligne de pointillés où écrire.
# --------------------------------------------------------------------------- #
EMPLACEMENTS = {
    # Identité de l'agent
    "nom": (166, 277),
    "im": (80, 298),
    "corps": (455, 298),
    "grade": (110, 322),
    "service": (160, 343),
    "budget": (110, 365),
    "chapitre": (410, 365),

    # Informations sur la demande
    "jours": (280, 425),
    "au_titre": (465, 388),
    "du": (88, 410),
    "au": (315, 410),
    "motif": (110, 432),
    "lieu": (240, 457),

    # Partie réservée à la décision et au solde
    "decision_num": (230, 658),
    "droit_annee": (195, 680),
    "jours_bas": (195, 698),
    "jours_restants": (195, 720),

    # Cases du type d'absence
    "croix_conge": (384, 163),
    "croix_permission": (384, 186),
    "croix_autorisation": (384, 209),
}

SOULIGNEMENTS_TYPES = {
    # x de départ, distance depuis le haut, largeur du trait (points PDF)
    "conge": (399, 170, 40),
    "permission": (405, 195, 60),
    "autorisation": (405, 218, 122),
}


def _y(depuis_haut: float) -> float:
    """Convertit une distance depuis le haut de page en ordonnée ReportLab."""
    return HAUTEUR - depuis_haut


def _ecrire(c, valeur, cle, taille=TAILLE):
    """Écrit une valeur à l'emplacement prévu, si elle existe."""
    if valeur in (None, ""):
        return
    x, haut = EMPLACEMENTS[cle]
    c.setFont(POLICE, taille)
    c.drawString(x, _y(haut), str(valeur))


def _souligner_type(c, cle):
    """Souligne le type d'absence sélectionné sur le formulaire officiel."""
    x, haut, largeur = SOULIGNEMENTS_TYPES[cle]

    c.saveState()
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.62)

    # Le trait est placé légèrement sous la ligne du libellé imprimé.
    y = _y(haut) - 2
    c.line(x, y, x + largeur, y)

    c.restoreState()


def _marquer_type_absence(c, demande):
    """Coche le type d'absence sur le formulaire officiel par une croix « X »."""
    if demande.type_absence == TypeAbsence.CONGE_ANNUEL:
        cle = "croix_conge"
    elif demande.type_absence == TypeAbsence.PERMISSION:
        cle = "croix_permission"
    else:
        # Le formulaire source regroupe les autres absences dans la catégorie
        # « autorisation / autre absence ».
        cle = "croix_autorisation"
    _ecrire(c, "X", cle, taille=12)

def _verifier_champs_obligatoires(demande):
    """Empêche de produire un formulaire officiel incomplet (RG-16)."""
    personnel = demande.personnel
    manquants = []

    champs = {
        "nom": personnel.nom_complet,
        "IM": personnel.im,
        "corps": personnel.corps,
        "grade": personnel.grade,
        "service ou direction": personnel.service or personnel.direction,
        "motif": demande.motif,
        "lieu de jouissance": demande.lieu_jouissance,
        "date de début": demande.date_debut,
        "date de fin": demande.date_fin,
        "nombre de jours": demande.nombre_jours,
    }
    for libelle, valeur in champs.items():
        if valeur is None or (isinstance(valeur, str) and not valeur.strip()) or valeur == 0:
            manquants.append(libelle)

    if demande.date_debut and demande.date_fin and demande.date_fin < demande.date_debut:
        raise ValidationError({"date_fin": "La date de fin précède la date de début."})

    if demande.type_absence == TypeAbsence.CONGE_ANNUEL and not demande.annee_titre:
        manquants.append("année au titre de laquelle le congé est demandé")

    if manquants:
        raise ValidationError(
            "Impossible de générer le formulaire officiel : champs obligatoires manquants ou invalides : "
            + ", ".join(manquants)
            + "."
        )


def _decision_et_solde_annuels(demande):
    """Retourne la décision RH valide et le solde correspondant à l'année du titre."""
    if demande.type_absence != TypeAbsence.CONGE_ANNUEL:
        return None, None

    annee = demande.annee_titre
    decisions = DecisionConge.objects.filter(
        personnel_id=demande.personnel_id,
        est_valide=True,
    ).order_by("-date_emission")
    decision = next((item for item in decisions if annee in item.annees()), None)
    if decision is None:
        raise ValidationError(
            {"annee_titre": f"Aucune décision RH valide couvrant l'année {annee} (RG-04)."}
        )

    for libelle, valeur in (
        ("numéro de décision RH", decision.numero_decision),
        ("budget de la décision RH", decision.budget),
        ("imputation budgétaire/chapitre de la décision RH", decision.imputation_budgetaire),
    ):
        if not (valeur or "").strip():
            raise ValidationError(
                f"Impossible de générer le formulaire officiel : {libelle} manquant dans la décision RH."
            )

    solde = demande.personnel.get_solde_actif(annee)
    if solde is None:
        raise ValidationError(
            {"annee_titre": f"Aucun solde de congé activé pour l'année {annee}."}
        )
    return decision, solde


def _corps_champs(c, demande, decision=None, solde=None):
    """Écrit les données de l'agent et de la demande sur le formulaire."""
    personnel = demande.personnel

    _ecrire(c, personnel.nom_complet, "nom")
    _ecrire(c, personnel.im, "im")
    _ecrire(c, personnel.corps, "corps")
    _ecrire(c, personnel.grade, "grade")
    _ecrire(c, personnel.service or personnel.direction, "service")
    _ecrire(c, demande.nombre_jours, "jours")
    _ecrire(c, demande.annee_titre if demande.type_absence == TypeAbsence.CONGE_ANNUEL else "", "au_titre")
    if demande.date_debut:
        _ecrire(c, demande.date_debut.strftime("%d/%m/%Y"), "du")
    if demande.date_fin:
        _ecrire(c, demande.date_fin.strftime("%d/%m/%Y"), "au")

    _ecrire(c, demande.motif.strip(), "motif")
    _ecrire(c, demande.lieu_jouissance.strip(), "lieu")

    if decision is not None and solde is not None:
        _ecrire(c, decision.budget, "budget")
        _ecrire(c, decision.imputation_budgetaire, "chapitre")
        _ecrire(c, decision.numero_decision, "decision_num")
        _ecrire(c, solde.droit_annuel + solde.report_anterieur, "droit_annee")


def _jours_restants(demande, solde=None):
    """Retourne le solde mobilisable uniquement pour un congé annuel (RG-03)."""
    if demande.type_absence != TypeAbsence.CONGE_ANNUEL:
        return None
    if solde is None:
        try:
            solde = demande.personnel.get_solde_actif(demande.annee)
        except Exception:  # noqa: BLE001
            return None
    if solde is None:
        return None
    return max(0, solde.jours_disponibles())


def _blocs_avis(c, demande, solde=None):
    """Écrit le nombre demandé et le solde disponible dans le bloc inférieur."""
    _ecrire(c, demande.nombre_jours, "jours_bas")
    _ecrire(c, _jours_restants(demande, solde), "jours_restants")


def generer_formulaire_pdf(demande):
    """Retourne un flux (BytesIO) : formulaire officiel pré-rempli.

    Le fichier imprimé est le document réglementaire du MEN lui-même, avec les
    données de l'agent écrites par-dessus. La demande doit exposer son personnel,
    ses dates et son nombre de jours ; ce dernier est recalculé s'il est absent.
    """
    if not demande.nombre_jours:
        demande.calculer_nombre_jours()

    _verifier_champs_obligatoires(demande)
    decision, solde = _decision_et_solde_annuels(demande)

    # Le calque de données est généré séparément, puis fusionné avec la page PDF
    # réglementaire originale : aucune image du formulaire n'est redessinée ou substituée.
    calque = BytesIO()
    c = canvas_lib.Canvas(calque, pagesize=A4)
    c.setTitle(f"Formulaire d'absence {demande.numero_enregistrement or demande.pk}")
    _marquer_type_absence(c, demande)
    _corps_champs(c, demande, decision=decision, solde=solde)
    _blocs_avis(c, demande, solde=solde)
    c.showPage()
    c.save()
    calque.seek(0)

    formulaire = PdfReader(str(FORMULAIRE_SOURCE))
    page = formulaire.pages[0]
    page.merge_page(PdfReader(calque).pages[0])

    sortie = BytesIO()
    redacteur = PdfWriter()
    redacteur.add_page(page)
    redacteur.write(sortie)
    sortie.seek(0)
    return sortie
