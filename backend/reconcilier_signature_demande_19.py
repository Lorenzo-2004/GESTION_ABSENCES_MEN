"""Initialise explicitement le journal d'audit pour la demande héritée n°19.

À exécuter une seule fois après application de la migration 0007.
N'altère pas la signature, ne crée pas de PDF et refuse toute situation ambiguë.
"""
from django.db import transaction
from conges.models import DemandeAbsence, TraceSignature
from conges.services.signatures import ajouter_trace_signature, verifier_integrite_demande

DEMANDE_ID = 19

with transaction.atomic():
    demande = DemandeAbsence.objects.select_for_update(of=("self",)).get(pk=DEMANDE_ID)

    controle = verifier_integrite_demande(demande)
    if controle.get("signature_integrite") is not True:
        raise RuntimeError(
            "Reconciliation refusee : la signature enregistrée ne correspond pas au fichier."
        )
    if not demande.signature_agent_sha256 or not demande.signature_agent:
        raise RuntimeError("Reconciliation refusee : signature ou empreinte absente.")
    if demande.traces_signature.exists():
        raise RuntimeError(
            "Reconciliation refusee : le journal contient déjà des traces ; aucune modification effectuée."
        )
    if demande.pdf_officiel or demande.pdf_officiel_sha256 or demande.signature_audit_dernier_hash:
        raise RuntimeError(
            "Reconciliation refusee : le PDF ou l'ancre d'audit existe déjà ; vérification manuelle nécessaire."
        )

    date_signature_initiale = (
        demande.date_signature_agent.isoformat() if demande.date_signature_agent else None
    )
    compte_signature_initiale = (
        demande.signature_agent_compte.get_username()
        if demande.signature_agent_compte_id else None
    )

    trace = ajouter_trace_signature(
        demande,
        TraceSignature.Evenement.SIGNATURE_AGENT_RECONCILIEE,
        acteur=None,
        signature_sha256=demande.signature_agent_sha256,
        details={
            "motif": "Le journal d'audit n'avait pas été initialisé lors de la soumission initiale.",
            "reconciliation_effectuee_maintenant": True,
            "date_signature_initiale_enregistree": date_signature_initiale,
            "compte_associe_a_la_signature_initiale": compte_signature_initiale,
            "confirmation": "L'image existante a été vérifiée par comparaison de son SHA-256. Aucun PDF n'a été créé par ce script.",
        },
    )

print("JOURNAL DE SIGNATURE INITIALISÉ")
print(f"Demande : {DEMANDE_ID}")
print(f"Événement : {trace.get_evenement_display()}")
print(f"Date de réconciliation : {trace.date_evenement.isoformat()}")
print(f"Empreinte de signature : {trace.signature_sha256}")
print("La date de signature initiale est conservée dans les détails ; la réconciliation est horodatée à sa date réelle.")
