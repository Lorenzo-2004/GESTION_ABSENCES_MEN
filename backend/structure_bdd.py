# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class AuthGroup(models.Model):
    name = models.CharField(unique=True, max_length=150)

    class Meta:
        managed = False
        db_table = 'auth_group'


class AuthGroupPermissions(models.Model):
    id = models.BigAutoField(primary_key=True)
    group = models.ForeignKey(AuthGroup, models.DO_NOTHING)
    permission = models.ForeignKey('AuthPermission', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_group_permissions'
        unique_together = (('group', 'permission'),)


class AuthPermission(models.Model):
    name = models.CharField(max_length=255)
    content_type = models.ForeignKey('DjangoContentType', models.DO_NOTHING)
    codename = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'auth_permission'
        unique_together = (('content_type', 'codename'),)


class DecisionsConge(models.Model):
    id_decision = models.BigAutoField(primary_key=True)
    numero_decision = models.CharField(unique=True, max_length=50)
    budget = models.CharField(max_length=100)
    imputation_budgetaire = models.CharField(max_length=100)
    corps_grade = models.CharField(max_length=200)
    indice = models.IntegerField(blank=True, null=True)
    annees_titre = models.CharField(max_length=50)
    details_jours = models.TextField()
    date_demande_reference = models.DateField(blank=True, null=True)
    date_emission = models.DateField()
    signataire = models.CharField(max_length=150)
    fichier_scan_path = models.CharField(max_length=100)
    est_valide = models.BooleanField()
    id_direction = models.ForeignKey('Directions', models.DO_NOTHING, db_column='id_direction')
    id_personnel = models.ForeignKey('Personnels', models.DO_NOTHING, db_column='id_personnel')
    id_demande = models.ForeignKey('DemandesAbsence', models.DO_NOTHING, db_column='id_demande', blank=True, null=True)
    nature = models.CharField(max_length=20)

    class Meta:
        managed = False
        db_table = 'decisions_conge'


class DemandesAbsence(models.Model):
    id_demande = models.BigAutoField(primary_key=True)
    numero_enregistrement = models.CharField(unique=True, max_length=30, blank=True, null=True)
    type_absence = models.CharField(max_length=20)
    motif = models.TextField()
    date_debut = models.DateField()
    date_fin = models.DateField()
    nombre_jours = models.SmallIntegerField()
    lieu_jouissance = models.CharField(max_length=200)
    fichier_justificatif = models.CharField(max_length=100, blank=True, null=True)
    statut_demande = models.CharField(max_length=15)
    date_creation = models.DateTimeField()
    id_personnel = models.ForeignKey('Personnels', models.DO_NOTHING, db_column='id_personnel')
    annee_titre = models.SmallIntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'demandes_absence'


class Directions(models.Model):
    id_direction = models.BigAutoField(primary_key=True)
    code_direction = models.CharField(unique=True, max_length=20)
    nom_direction = models.CharField(max_length=200)

    class Meta:
        managed = False
        db_table = 'directions'


class DjangoAdminLog(models.Model):
    action_time = models.DateTimeField()
    object_id = models.TextField(blank=True, null=True)
    object_repr = models.CharField(max_length=200)
    action_flag = models.SmallIntegerField()
    change_message = models.TextField()
    content_type = models.ForeignKey('DjangoContentType', models.DO_NOTHING, blank=True, null=True)
    user = models.ForeignKey('Utilisateurs', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'django_admin_log'


class DjangoContentType(models.Model):
    app_label = models.CharField(max_length=100)
    model = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'django_content_type'
        unique_together = (('app_label', 'model'),)


class DjangoMigrations(models.Model):
    id = models.BigAutoField(primary_key=True)
    app = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    applied = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_migrations'


class DjangoSession(models.Model):
    session_key = models.CharField(primary_key=True, max_length=40)
    session_data = models.TextField()
    expire_date = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_session'


class Personnels(models.Model):
    id_personnel = models.BigAutoField(primary_key=True)
    im = models.CharField(unique=True, max_length=20)
    cin = models.CharField(unique=True, max_length=20)
    nom = models.CharField(max_length=100)
    prenoms = models.CharField(max_length=150)
    sexe = models.CharField(max_length=1)
    date_naissance = models.DateField()
    telephone = models.CharField(max_length=30)
    email = models.CharField(max_length=254)
    statut = models.CharField(max_length=15)
    corps = models.CharField(max_length=100)
    grade = models.CharField(max_length=100)
    check_presence = models.BooleanField()
    id_direction = models.ForeignKey(Directions, models.DO_NOTHING, db_column='id_direction')
    id_service = models.ForeignKey('Services', models.DO_NOTHING, db_column='id_service', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'personnels'


class Services(models.Model):
    id_service = models.BigAutoField(primary_key=True)
    code_service = models.CharField(max_length=20)
    nom_service = models.CharField(max_length=200)
    id_direction = models.ForeignKey(Directions, models.DO_NOTHING, db_column='id_direction')

    class Meta:
        managed = False
        db_table = 'services'
        unique_together = (('id_direction', 'code_service'),)


class SoldesConge(models.Model):
    id_solde = models.BigAutoField(primary_key=True)
    annee = models.SmallIntegerField()
    droit_annuel = models.SmallIntegerField()
    jours_pris = models.SmallIntegerField()
    solde_restant = models.SmallIntegerField()
    id_personnel = models.ForeignKey(Personnels, models.DO_NOTHING, db_column='id_personnel')
    report_anterieur = models.SmallIntegerField()

    class Meta:
        managed = False
        db_table = 'soldes_conge'
        unique_together = (('id_personnel', 'annee'),)


class TokenBlacklistBlacklistedtoken(models.Model):
    id = models.BigAutoField(primary_key=True)
    blacklisted_at = models.DateTimeField()
    token = models.OneToOneField('TokenBlacklistOutstandingtoken', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'token_blacklist_blacklistedtoken'


class TokenBlacklistOutstandingtoken(models.Model):
    id = models.BigAutoField(primary_key=True)
    token = models.TextField()
    created_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField()
    user = models.ForeignKey('Utilisateurs', models.DO_NOTHING, blank=True, null=True)
    jti = models.CharField(unique=True, max_length=255)

    class Meta:
        managed = False
        db_table = 'token_blacklist_outstandingtoken'


class Utilisateurs(models.Model):
    id = models.BigAutoField(primary_key=True)
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(blank=True, null=True)
    is_superuser = models.BooleanField()
    username = models.CharField(unique=True, max_length=150)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)
    is_staff = models.BooleanField()
    is_active = models.BooleanField()
    date_joined = models.DateTimeField()
    role = models.CharField(max_length=20)
    personnel = models.OneToOneField(Personnels, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'utilisateurs'


class UtilisateursGroups(models.Model):
    id = models.BigAutoField(primary_key=True)
    utilisateur = models.ForeignKey(Utilisateurs, models.DO_NOTHING)
    group = models.ForeignKey(AuthGroup, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'utilisateurs_groups'
        unique_together = (('utilisateur', 'group'),)


class UtilisateursUserPermissions(models.Model):
    id = models.BigAutoField(primary_key=True)
    utilisateur = models.ForeignKey(Utilisateurs, models.DO_NOTHING)
    permission = models.ForeignKey(AuthPermission, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'utilisateurs_user_permissions'
        unique_together = (('utilisateur', 'permission'),)


class ValidationsWorkflow(models.Model):
    id_validation = models.BigAutoField(primary_key=True)
    niveau = models.CharField(max_length=15)
    avis = models.CharField(max_length=15)
    observation = models.TextField()
    date_action = models.DateTimeField()
    id_demande = models.ForeignKey(DemandesAbsence, models.DO_NOTHING, db_column='id_demande')
    id_valideur = models.ForeignKey(Personnels, models.DO_NOTHING, db_column='id_valideur')

    class Meta:
        managed = False
        db_table = 'validations_workflow'
