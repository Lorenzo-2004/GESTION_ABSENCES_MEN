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
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as canvas_lib
from pypdf import PdfReader, PdfWriter
from django.core.exceptions import ValidationError
from django.utils import timezone

from ..enums import TypeAbsence
from ..models import DecisionConge
from ..regles import TYPES_AVEC_FORMULAIRE_OFFICIEL

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
    # En-tête : numéro d'ordre après « N° 2026- » et date après « Antananarivo, le »
    "numero": (108, 241.0),
    "date_demande": (453, 146.4),

    # Identité de l'agent (ordonnée = ligne de base des libellés mesurée sur le scan)
    "nom": (166, 277.2),
    "im": (80, 299.4),
    "corps": (344, 299.4),
    "grade": (110, 321.0),
    "service": (160, 343.0),
    "budget": (110, 364.4),
    "chapitre": (358, 364.4),

    # Informations sur la demande
    "jours": (290, 386.4),
    "au_titre": (465, 386.4),
    "du": (88, 407.4),
    "au": (290, 407.4),
    "motif": (104, 429.0),
    "lieu": (182, 452.2),

    # Partie réservée à la décision et au solde
    "decision_num": (198, 656.5),
    "decision_date": (336, 656.5),
    "droit_annee": (198, 677.8),
    "jours_bas": (198, 698.0),
    "jours_restants": (198, 719.0),
}

# Bord droit (en points) à ne pas dépasser pour chaque valeur : marge de la page,
# ou début du libellé suivant sur la même ligne. Au-delà, la taille du texte est
# réduite, puis le texte est tronqué avec « … » en dernier recours.
BORD_DROIT_PAR_DEFAUT = 540
BORDS_DROITS = {
    "numero": 158,
    "date_demande": 540,
    "budget": 290,
    "jours": 385,
    "au_titre": 540,
    "du": 262,
    "decision_num": 252,
    "decision_date": 540,
    "droit_annee": 262,
    "jours_bas": 262,
    "jours_restants": 262,
}
TAILLE_MIN = 7.0

# Soulignement du type d'absence, dans le bloc « DEMANDE DE : ».
# Positions mesurées sur le scan du formulaire (pixels à 4x convertis en points) :
# (x de départ, x de fin, distance du trait depuis le haut de la page).
# Le trait commence à la première lettre (après le tiret) et finit à la dernière,
# environ 1,6 pt sous la ligne de base du libellé.
SOULIGNEMENTS_TYPES = {
    "conge": (398.5, 434.0, 169.8),
    "permission": (398.7, 460.2, 186.6),
    "autorisation": (398.7, 537.2, 203.8),
}

# Types sans ligne propre sur le formulaire : ils relèvent de « AUTORISATION D'ABSENCE ».
LIGNE_PAR_TYPE = {
    TypeAbsence.CONGE_ANNUEL: "conge",
    TypeAbsence.PERMISSION: "permission",
}
LIGNE_PAR_DEFAUT = "autorisation"


def _y(depuis_haut: float) -> float:
    """Convertit une distance depuis le haut de page en ordonnée ReportLab."""
    return HAUTEUR - depuis_haut


def _ecrire(c, valeur, cle, taille=TAILLE):
    """Écrit une valeur à l'emplacement prévu, si elle existe.

    La valeur ne déborde jamais sur le libellé suivant ni hors de la page : la taille
    de la police diminue jusqu'à TAILLE_MIN, puis le texte est tronqué avec « … ».
    """
    if valeur in (None, ""):
        return
    texte = str(valeur)
    x, haut = EMPLACEMENTS[cle]
    largeur_max = BORDS_DROITS.get(cle, BORD_DROIT_PAR_DEFAUT) - x

    while taille > TAILLE_MIN and stringWidth(texte, POLICE, taille) > largeur_max:
        taille -= 0.25
    if stringWidth(texte, POLICE, taille) > largeur_max:
        while len(texte) > 1 and stringWidth(texte + "…", POLICE, taille) > largeur_max:
            texte = texte[:-1]
        texte = texte.rstrip() + "…"

    c.setFont(POLICE, taille)
    c.drawString(x, _y(haut), texte)


def _souligner_type(c, cle):
    """Souligne le libellé du type d'absence choisi sur le formulaire officiel."""
    x_debut, x_fin, haut = SOULIGNEMENTS_TYPES[cle]

    c.saveState()
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.9)
    c.line(x_debut, _y(haut), x_fin, _y(haut))
    c.restoreState()


def _marquer_type_absence(c, demande):
    """Souligne CONGE, PERMISSION ou AUTORISATION D'ABSENCE selon le type de la demande."""
    cle = LIGNE_PAR_TYPE.get(demande.type_absence, LIGNE_PAR_DEFAUT)
    _souligner_type(c, cle)


def _verifier_champs_obligatoires(demande):
    """Empêche de produire un formulaire officiel incomplet (RG-16)."""
    from .demandes import verifier_dossier_complet

    if demande.date_debut and demande.date_fin and demande.date_fin < demande.date_debut:
        raise ValidationError({"date_fin": "La date de fin précède la date de début."})
    if not demande.nombre_jours:
        raise ValidationError("Impossible de générer le formulaire : nombre de jours invalide.")
    if demande.type_absence == TypeAbsence.CONGE_ANNUEL and not demande.annee_titre:
        raise ValidationError(
            "Impossible de générer le formulaire : année au titre de laquelle "
            "le congé est demandé manquante."
        )
    verifier_dossier_complet(demande)


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


def _date_de_la_demande(demande):
    """Date du dépôt (heure locale) ; la date du jour pour une demande pas encore enregistrée."""
    creation = getattr(demande, "date_creation", None)
    if creation is None:
        return date.today()
    if hasattr(creation, "astimezone") and timezone.is_aware(creation):
        creation = timezone.localtime(creation)
    return creation.date() if hasattr(creation, "date") else creation


def _corps_champs(c, demande, decision=None, solde=None):
    """Écrit les données de l'agent et de la demande sur le formulaire."""
    personnel = demande.personnel

    # « N° 2026-.....-MEN/SG/DSI » : seul le numéro d'ordre s'écrit dans les pointillés
    # (« DA-2026-00007 » → « 00007 »). Le millésime est déjà imprimé sur le formulaire.
    if demande.numero_enregistrement:
        _ecrire(c, demande.numero_enregistrement.rsplit("-", 1)[-1], "numero")
    _ecrire(c, _date_de_la_demande(demande).strftime("%d/%m/%Y"), "date_demande")

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
        if decision.date_emission:
            _ecrire(c, decision.date_emission.strftime("%d/%m/%Y"), "decision_date")
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


def _ajouter_signature_agent(c, demande):
    """Imprime la signature capturée à la soumission dans la zone de l'intéressé(e)."""
    if not getattr(demande, "signature_agent", None):
        return  # Compatibilité avec les demandes historiques antérieures à la signature.

    fichier = demande.signature_agent
    try:
        fichier.open("rb")
        try:
            image = ImageReader(fichier.file)
            largeur, hauteur = image.getSize()
            largeur_max, hauteur_max = 128.0, 31.0
            facteur = min(largeur_max / largeur, hauteur_max / hauteur)
            largeur_affichee, hauteur_affichee = largeur * facteur, hauteur * facteur
            # Zone blanche sous le libellé « Signature de l'intéressé(e) » sur le modèle MEN.
            x = 354.0
            y = 330.0
            c.drawImage(
                image, x, y, width=largeur_affichee, height=hauteur_affichee,
                preserveAspectRatio=True, mask="auto",
            )
        finally:
            fichier.close()
    except Exception as exc:
        raise ValidationError(
            "La signature enregistrée ne peut pas être intégrée au formulaire officiel. "
            "Veuillez contacter le service gestionnaire."
        ) from exc


def generer_formulaire_pdf(demande):
    """Retourne un flux (BytesIO) : formulaire officiel pré-rempli.

    Seuls le congé annuel, la permission et l'autorisation ont une fiche officielle.
    Maternité, paternité, mission et repos sanitaire sont des annonces sans formulaire.
    """
    if demande.type_absence not in TYPES_AVEC_FORMULAIRE_OFFICIEL:
        raise ValidationError(
            "La fiche officielle MEN est réservée au congé annuel, à la permission "
            "et à l'autorisation d'absence. Ce type est traité comme une annonce."
        )

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
    _ajouter_signature_agent(c, demande)
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