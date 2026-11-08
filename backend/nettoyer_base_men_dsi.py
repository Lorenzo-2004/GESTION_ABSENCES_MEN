#!/usr/bin/env python
"""Réinitialisation ciblée des données de congé de la DSI uniquement.

Par défaut, affiche un aperçu sans modifier la base.
Application : python nettoyer_base_men_dsi.py --apply
Le script exige backup_men_20261022_104855.dump dans le dossier courant et
une confirmation exacte. Il conserve les personnels, comptes et données des
autres directions. Les fichiers physiques dans MEDIA_ROOT ne sont pas effacés.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _unique_code(Service, direction, base: str) -> str:
    code = base[:20]
    suffix = 2
    while Service.objects.filter(direction=direction, code_service=code).exists():
        code = f"{base[:16]}-{suffix}"[:20]
        suffix += 1
    return code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Appliquer le nettoyage après aperçu et confirmation.")
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        import django
        django.setup()
        from django.apps import apps
        from django.db import connection, transaction
    except Exception as exc:
        print(f"Impossible de charger Django : {exc}", file=sys.stderr)
        return 2

    try:
        Direction = apps.get_model("organisation", "Direction")
        Service = apps.get_model("organisation", "Service")
        Personnel = apps.get_model("personnels", "Personnel")
        Utilisateur = apps.get_model("personnels", "Utilisateur")
        DemandeAbsence = apps.get_model("conges", "DemandeAbsence")
        DecisionConge = apps.get_model("conges", "DecisionConge")
        SoldeConge = apps.get_model("conges", "SoldeConge")
        ValidationWorkflow = apps.get_model("conges", "ValidationWorkflow")
        TraceSignature = apps.get_model("conges", "TraceSignature")
        dsi = Direction.objects.get(code_direction="DSI")
    except Exception as exc:
        print(f"Impossible d'identifier la DSI et les modèles requis. Aucun changement effectué : {exc}", file=sys.stderr)
        return 3

    backup = Path.cwd() / "backup_men_20261022_104855.dump"

    def afficher_aperçu() -> dict:
        personnes = Personnel.objects.filter(direction=dsi).select_related("service").order_by("im")
        comptes = Utilisateur.objects.filter(personnel__direction=dsi).select_related("personnel").order_by("username")
        demandes = DemandeAbsence.objects.filter(personnel__direction=dsi).select_related("personnel").order_by("id_demande")
        decisions = DecisionConge.objects.filter(personnel__direction=dsi).select_related("personnel").order_by("id_decision")
        soldes = SoldeConge.objects.filter(personnel__direction=dsi).select_related("personnel").order_by("id_solde")
        validations = ValidationWorkflow.objects.filter(demande__personnel__direction=dsi).order_by("id_validation")
        traces = TraceSignature.objects.filter(demande__personnel__direction=dsi).order_by("id_trace")
        demande_ids = list(demandes.values_list("pk", flat=True))

        print("\n=== APERÇU : NETTOYAGE DSI UNIQUEMENT ===")
        print(f"Base configurée : {connection.settings_dict.get('NAME')}")
        print(f"Direction ciblée : {dsi.code_direction} — {dsi.nom_direction} (ID {dsi.pk})")
        print(f"Sauvegarde attendue : {backup} ({'présente' if backup.is_file() else 'absente'})")
        print("\nServices de la DSI :")
        for service in Service.objects.filter(direction=dsi).order_by("code_service"):
            print(f"  - ID {service.pk} | {service.code_service} | {service.nom_service}")
        if not Service.objects.filter(direction=dsi, nom_service__iexact="Service RH").exists():
            print("  - Un Service RH sera créé dans la DSI au moment de l'application.")
        if not Service.objects.filter(direction=dsi, nom_service__iexact="Service Informatique").exists():
            print("  - Un Service Informatique sera créé dans la DSI au moment de l'application.")

        print("\nPersonnels DSI conservés (ID | IM | nom | service) :")
        for p in personnes:
            print(f"  - {p.pk} | {p.im} | {p.nom_complet} | {p.service.nom_service if p.service_id else '(sans service)'}")
        print("\nComptes liés aux personnels DSI conservés (identifiant | rôle | IM) :")
        for compte in comptes:
            print(f"  - {compte.username} | {compte.role} | {compte.personnel.im if compte.personnel_id else '-'}")

        demandes_rows = list(demandes.values_list("id_demande", "personnel__im", "type_absence", "statut_demande", "date_debut", "date_fin"))
        decisions_rows = list(decisions.values_list("id_decision", "numero_decision", "personnel__im", "indice", "annees_titre"))
        soldes_rows = list(soldes.values_list("id_solde", "personnel__im", "annee", "droit_annuel", "report_anterieur", "jours_pris", "solde_restant"))
        validation_ids = list(validations.values_list("id_validation", flat=True))
        trace_ids = list(traces.values_list("id_trace", flat=True))

        print("\nDemandes DSI qui seront supprimées (ID, IM, type, statut, dates) :")
        print(f"  {demandes_rows if demandes_rows else '(aucune)'}")
        print("Décisions DSI qui seront supprimées (ID, numéro, IM, indice, années) :")
        print(f"  {decisions_rows if decisions_rows else '(aucune)'}")
        print("Soldes DSI qui seront supprimés (ID, IM, année, droit, report, pris, restant) :")
        print(f"  {soldes_rows if soldes_rows else '(aucun)'}")
        print(f"Validations liées aux demandes DSI à supprimer : {validation_ids if validation_ids else '(aucune)'}")
        print(f"Traces de signature liées aux demandes DSI à supprimer : {trace_ids if trace_ids else '(aucune)'}")
        print("\nHors périmètre : aucune donnée des autres directions ne sera supprimée ou modifiée.")
        print("Les personnels et comptes DSI sont conservés. Les fichiers physiques de media/ ne sont pas supprimés.")
        print("Aucune création/modification n'a lieu en mode aperçu.")
        return {"demande_ids": demande_ids, "n_demandes": len(demandes_rows), "n_decisions": len(decisions_rows), "n_soldes": len(soldes_rows), "n_validations": len(validation_ids), "n_traces": len(trace_ids)}

    preview = afficher_aperçu()
    if not args.apply:
        print("\nMODE APERÇU : aucune modification effectuée.")
        print("Après vérification, exécute : python nettoyer_base_men_dsi.py --apply")
        return 0

    if not backup.is_file() or backup.stat().st_size == 0:
        print("Sauvegarde absente ou vide. Nettoyage refusé. Place le dump demandé dans le dossier backend.", file=sys.stderr)
        return 4

    print("\nATTENTION : seules les demandes, décisions, soldes, validations et traces rattachés aux personnels DSI seront nettoyés.")
    print("Les personnels/comptes DSI et toutes les données des autres directions seront conservés.")
    confirmation = input("Pour confirmer, tape exactement NETTOYER DSI : ").strip()
    if confirmation != "NETTOYER DSI":
        print("Confirmation incorrecte. Aucun changement effectué.")
        return 5

    try:
        with transaction.atomic():
            # Recalculer les ID dans la transaction pour éviter d'utiliser uniquement l'aperçu ancien.
            dsi_demandes = DemandeAbsence.objects.filter(personnel__direction=dsi)
            demande_ids = list(dsi_demandes.values_list("pk", flat=True))

            # Le journal des signatures est append-only via l'ORM. Dans cette remise à zéro
            # locale confirmée, supprimer uniquement les traces des demandes DSI par SQL direct.
            if demande_ids:
                trace_table = connection.ops.quote_name(TraceSignature._meta.db_table)
                demande_column = connection.ops.quote_name(TraceSignature._meta.get_field("demande").column)
                placeholders = ", ".join(["%s"] * len(demande_ids))
                sql = f"DELETE FROM {trace_table} WHERE {demande_column} IN ({placeholders})"
                with connection.cursor() as cursor:
                    cursor.execute(sql, demande_ids)

            ValidationWorkflow.objects.filter(demande_id__in=demande_ids).delete()
            DecisionConge.objects.filter(personnel__direction=dsi).delete()
            SoldeConge.objects.filter(personnel__direction=dsi).delete()
            dsi_demandes.delete()

            # L'organisation hors DSI n'est pas touchée.
            service_rh = Service.objects.filter(direction=dsi, nom_service__iexact="Service RH").first()
            if service_rh is None:
                service_rh = Service.objects.create(
                    direction=dsi,
                    code_service=_unique_code(Service, dsi, "SRH"),
                    nom_service="Service RH",
                )

            service_info = Service.objects.filter(direction=dsi, nom_service__iexact="Service Informatique").first()
            if service_info is None:
                service_info = Service.objects.create(
                    direction=dsi,
                    code_service=_unique_code(Service, dsi, "SINFO"),
                    nom_service="Service Informatique",
                )

            # Affectation cohérente par rôle pour les comptes DSI : RH au Service RH,
            # agents au Service Informatique. Les autres rôles restent inchangés.
            comptes_rh = Utilisateur.objects.filter(personnel__direction=dsi, role="ROLE_RH").select_related("personnel")
            for compte in comptes_rh:
                if compte.personnel.service_id != service_rh.pk:
                    compte.personnel.service = service_rh
                    compte.personnel.save(update_fields=["service"])

            comptes_agents = Utilisateur.objects.filter(personnel__direction=dsi, role="ROLE_AGENT").select_related("personnel")
            for compte in comptes_agents:
                if compte.personnel.service_id != service_info.pk:
                    compte.personnel.service = service_info
                    compte.personnel.save(update_fields=["service"])

        print("\nNETTOYAGE DSI TERMINÉ.")
        print("Les personnels et comptes DSI sont conservés ; leurs données de congé ont été réinitialisées.")
        print("La DSI dispose de ses services RH et Informatique, avec les comptes ROLE_RH et ROLE_AGENT affectés au service correspondant.")
        print("Aucune donnée des autres directions n'a été ciblée. Aucune migration n'est nécessaire.")
        return 0
    except Exception as exc:
        print(f"Échec du nettoyage : {exc}", file=sys.stderr)
        print("La transaction devrait être annulée automatiquement en cas d'erreur.", file=sys.stderr)
        return 6


if __name__ == "__main__":
    raise SystemExit(main())
