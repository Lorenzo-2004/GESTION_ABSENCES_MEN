"""Traçabilité et vérification d'intégrité des signatures de demande MEN."""

import hashlib
import hmac
import json
from typing import Any

from django.db import transaction
from django.utils import timezone

from conges.models import DemandeAbsence, TraceSignature


def sha256_octets(contenu: bytes) -> str:
    return hashlib.sha256(contenu).hexdigest()


def _json_canonique(valeur: dict[str, Any]) -> bytes:
    return json.dumps(
        valeur, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    ).encode("utf-8")


def calculer_empreinte_evenement(trace: TraceSignature) -> str:
    """Calcule une empreinte stable basée sur les champs d'audit enregistrés."""
    corps = {
        "demande_id": trace.demande_id,
        "evenement": trace.evenement,
        "date_evenement": trace.date_evenement.isoformat(),
        "acteur_id_snapshot": trace.acteur_id_snapshot,
        "acteur_identifiant": trace.acteur_identifiant,
        "signature_sha256": trace.signature_sha256 or "",
        "pdf_sha256": trace.pdf_sha256 or "",
        "empreinte_precedente": trace.empreinte_precedente or "",
        "details": trace.details or {},
    }
    return sha256_octets(_json_canonique(corps))


def ajouter_trace_signature(
    demande: DemandeAbsence,
    evenement: str,
    acteur=None,
    *,
    signature_sha256: str = "",
    pdf_sha256: str = "",
    details: dict[str, Any] | None = None,
) -> TraceSignature:
    """Ajoute une trace sans modifier une entrée existante et met à jour l'ancre."""
    details = details or {}
    with transaction.atomic():
        demande_verrouillee = DemandeAbsence.objects.select_for_update(of=("self",)).get(
            pk=demande.pk
        )
        precedent = TraceSignature.objects.filter(demande=demande_verrouillee).order_by("-id_trace").first()
        horodatage = timezone.now()
        identifiant_acteur = (acteur.get_username() if acteur and hasattr(acteur, "get_username") else "") or "système"
        trace = TraceSignature(
            demande=demande_verrouillee,
            evenement=evenement,
            date_evenement=horodatage,
            acteur=acteur if getattr(acteur, "pk", None) else None,
            acteur_id_snapshot=getattr(acteur, "pk", None),
            acteur_identifiant=identifiant_acteur[:150],
            signature_sha256=signature_sha256 or demande_verrouillee.signature_agent_sha256 or "",
            pdf_sha256=pdf_sha256 or demande_verrouillee.pdf_officiel_sha256 or "",
            empreinte_precedente=precedent.empreinte_evenement if precedent else "",
            details=details,
        )
        trace.empreinte_evenement = calculer_empreinte_evenement(trace)
        trace.save(force_insert=True)
        demande_verrouillee.signature_audit_dernier_hash = trace.empreinte_evenement
        demande_verrouillee.save(update_fields=["signature_audit_dernier_hash"])
        demande.signature_audit_dernier_hash = trace.empreinte_evenement
        return trace


def _empreinte_fichier(champ_fichier) -> str | None:
    if not champ_fichier or not getattr(champ_fichier, "name", ""):
        return None
    try:
        digest = hashlib.sha256()
        with champ_fichier.storage.open(champ_fichier.name, "rb") as fichier:
            for bloc in iter(lambda: fichier.read(1024 * 1024), b""):
                digest.update(bloc)
        return digest.hexdigest()
    except (OSError, ValueError, FileNotFoundError):
        return None


def verifier_chaine_audit(demande: DemandeAbsence) -> bool | None:
    """Vérifie le chaînage entier et l'ancre située sur la demande."""
    traces = list(demande.traces_signature.order_by("id_trace"))
    if not traces:
        if demande.signature_agent_sha256 or demande.pdf_officiel_sha256 or demande.signature_audit_dernier_hash:
            return False
        return None  # Demande antérieure au journal de signature.

    precedent = ""
    for trace in traces:
        if not hmac.compare_digest(trace.empreinte_precedente or "", precedent):
            return False
        try:
            calculee = calculer_empreinte_evenement(trace)
        except (TypeError, ValueError):
            return False
        if not hmac.compare_digest(trace.empreinte_evenement or "", calculee):
            return False
        precedent = trace.empreinte_evenement

    if not hmac.compare_digest(demande.signature_audit_dernier_hash or "", precedent):
        return False

    evenements_signature = {
        TraceSignature.Evenement.SIGNATURE_AGENT_ENREGISTREE,
        # Permet d'identifier explicitement les demandes signées avant
        # l'activation du journal d'audit, dont la trace est réconciliée ensuite.
        TraceSignature.Evenement.SIGNATURE_AGENT_RECONCILIEE,
    }
    if demande.signature_agent_sha256 and not any(
        t.evenement in evenements_signature
        and hmac.compare_digest(t.signature_sha256 or "", demande.signature_agent_sha256)
        for t in traces
    ):
        return False

    if demande.pdf_officiel_sha256 and not any(
        t.evenement == TraceSignature.Evenement.PDF_OFFICIEL_SCELE
        and hmac.compare_digest(t.pdf_sha256 or "", demande.pdf_officiel_sha256)
        for t in traces
    ):
        return False
    return True


def verifier_integrite_demande(demande: DemandeAbsence) -> dict[str, Any]:
    """Retourne les résultats séparés pour signature, document et journal."""
    signature_attendue = demande.signature_agent_sha256 or ""
    signature_reelle = _empreinte_fichier(demande.signature_agent)
    if signature_attendue:
        signature_ok: bool | None = bool(
            signature_reelle and hmac.compare_digest(signature_attendue, signature_reelle)
        )
    elif demande.signature_agent:
        signature_ok = False
    else:
        signature_ok = None  # Ancienne demande éventuelle sans signature électronique.

    pdf_attendu = demande.pdf_officiel_sha256 or ""
    pdf_reel = _empreinte_fichier(demande.pdf_officiel)
    if pdf_attendu:
        pdf_ok: bool | None = bool(pdf_reel and hmac.compare_digest(pdf_attendu, pdf_reel))
    elif demande.pdf_officiel:
        pdf_ok = False
    else:
        pdf_ok = None  # Aucun formulaire officiel n'a encore été scellé.

    chaine_ok = verifier_chaine_audit(demande)
    controles = [valeur for valeur in (signature_ok, pdf_ok, chaine_ok) if valeur is not None]
    global_ok = all(controles) if controles else None
    return {
        "signature_presente": bool(demande.signature_agent),
        "signature_integrite": signature_ok,
        "document_present": bool(demande.pdf_officiel),
        "document_integrite": pdf_ok,
        "journal_integrite": chaine_ok,
        "integrite_globale": global_ok,
        "empreinte_pdf": demande.pdf_officiel_sha256 or None,
        "pdf_genere_le": demande.pdf_officiel_genere_le,
        "signature_le": demande.date_signature_agent,
        "signature_par": (
            demande.signature_agent_compte.get_username() if demande.signature_agent_compte_id else None
        ),
    }
