"""Répare les champs d'imputation manquants sur les décisions DSI de démonstration.

Exécution via :
  python manage.py shell -c "exec(open('corriger_pdf_400_dsi.py', encoding='utf-8-sig').read())"
Par défaut, le script n'écrit rien. Pour appliquer, définir :
  $env:MEN_REPARER_PDF_400_DSI = "1"
Puis relancer la commande.
"""

import os
from django.db import transaction

from conges.models import DecisionConge, DemandeAbsence
from conges.services.pdf import _decision_et_solde_annuels, _verifier_champs_obligatoires, generer_formulaire_pdf

REFERENCES_DSI_DEMO = (
    "001/DSI/2026",
    "002/DSI/2026",
    "003/DSI/2026",
)
IMPUTATION_LOCALE = "TEST DSI 2026"
DEMANDE_ID = int(os.environ.get("MEN_DEMANDE_FORMULAIRE_ID", "21"))
APPLIQUER = os.environ.get("MEN_REPARER_PDF_400_DSI") == "1"


def afficher_erreur(etape, exc):
    messages = getattr(exc, "messages", None)
    if messages:
        print(f"BLOQUANT {etape}: {' | '.join(str(m) for m in messages)}")
    elif getattr(exc, "message_dict", None):
        print(f"BLOQUANT {etape}: {exc.message_dict}")
    else:
        print(f"BLOQUANT {etape}: {exc}")


print("=== DIAGNOSTIC / CORRECTION DU PDF OFFICIEL DSI ===")
print("Mode : APPLICATION" if APPLIQUER else "Mode : APERÇU (aucune écriture)")
print(f"Demande observée : ID {DEMANDE_ID}")

with transaction.atomic():
    decisions = list(
        DecisionConge.objects.select_for_update()
        .filter(
            numero_decision__in=REFERENCES_DSI_DEMO,
            personnel__direction__code_direction="DSI",
        )
        .select_related("personnel", "direction")
        .order_by("numero_decision")
    )
    refs_trouvees = {d.numero_decision for d in decisions}
    for ref in REFERENCES_DSI_DEMO:
        if ref not in refs_trouvees:
            print(f"ATTENTION : décision introuvable ou hors DSI : {ref}")

    for decision in decisions:
        print(
            f"Décision {decision.numero_decision} | IM {decision.personnel.im} "
            f"| activée={decision.est_valide} | budget={decision.budget!r} "
            f"| imputation actuelle={decision.imputation_budgetaire!r}"
        )
        if not decision.imputation_budgetaire.strip():
            if APPLIQUER:
                decision.imputation_budgetaire = IMPUTATION_LOCALE
                decision.save(update_fields=["imputation_budgetaire"])
                print(f"  CORRIGÉ : imputation={decision.imputation_budgetaire!r}")
            else:
                print(f"  À CORRIGER : imputation serait renseignée avec {IMPUTATION_LOCALE!r}")
        else:
            print("  Aucun changement nécessaire pour l'imputation.")

    if APPLIQUER:
        # Valide les écritures dans une transaction ; en cas d'erreur, rien n'est commité.
        for decision in decisions:
            decision.refresh_from_db()
            if not decision.imputation_budgetaire.strip():
                raise RuntimeError(f"Imputation toujours vide : {decision.numero_decision}")

    try:
        demande = (
            DemandeAbsence.objects.select_related("personnel", "personnel__direction", "personnel__service")
            .get(pk=DEMANDE_ID)
        )
    except DemandeAbsence.DoesNotExist:
        print(f"ATTENTION : demande {DEMANDE_ID} introuvable. Aucune génération de test.")
        demande = None

    if demande is not None:
        print("--- Données de la demande ---")
        print(
            f"ID={demande.pk} | IM={demande.personnel.im} | type={demande.type_absence} "
            f"| statut={demande.statut_demande} | jours={demande.nombre_jours} "
            f"| année_titre={demande.annee_titre}"
        )
        print(f"Motif renseigné : {bool((demande.motif or '').strip())}")
        print(f"Lieu de jouissance : {demande.lieu_jouissance!r}")
        print(f"Corps : {demande.personnel.corps!r} | Grade : {demande.personnel.grade!r}")
        print(f"Service/direction : {demande.personnel.service or demande.personnel.direction}")

        for titre, controle in (
            ("Champs du formulaire", lambda: _verifier_champs_obligatoires(demande)),
            ("Décision et solde annuels", lambda: _decision_et_solde_annuels(demande)),
        ):
            try:
                controle()
                print(f"OK {titre}")
            except Exception as exc:
                afficher_erreur(titre, exc)

        try:
            from conges.services.signatures import verifier_integrite_demande
            integrity = verifier_integrite_demande(demande)
            print(
                "Intégrité avant génération : "
                f"signature={integrity['signature_integrite']}, "
                f"journal={integrity['journal_integrite']}, "
                f"document={integrity['document_integrite']}"
            )
            if integrity["signature_integrite"] is False or integrity["journal_integrite"] is False:
                print("ATTENTION : après la correction du HTTP 400, l'endpoint peut encore refuser le PDF au contrôle d'intégrité.")
        except Exception as exc:
            afficher_erreur("Contrôle d'intégrité", exc)

        try:
            flux = generer_formulaire_pdf(demande)
            contenu = flux.getvalue() if hasattr(flux, "getvalue") else flux.read()
            if not contenu.startswith(b"%PDF-"):
                print("BLOQUANT Génération : le résultat ne commence pas par %PDF-.")
            else:
                print(f"OK Génération PDF en mémoire : {len(contenu)} octets. Aucun PDF n'a été enregistré.")
        except Exception as exc:
            afficher_erreur("Génération PDF en mémoire", exc)

    if not APPLIQUER:
        # Les opérations de lecture/diagnostic sont sans effet. Toute écriture
        # n'arrive que dans la branche APPLIQUER, au-dessus.
        pass

if not APPLIQUER:
    print("\nAperçu terminé. Pour appliquer uniquement les imputations manquantes des trois décisions locales DSI :")
    print('$env:MEN_REPARER_PDF_400_DSI = "1"')
    print('python manage.py shell -c "exec(open(\'corriger_pdf_400_dsi.py\', encoding=\'utf-8-sig\').read())"')
    print("Remove-Item Env:MEN_REPARER_PDF_400_DSI")
else:
    print("\nCorrection terminée. Aucun formulaire PDF n'a été stocké ni aucune trace de signature ajoutée.")
