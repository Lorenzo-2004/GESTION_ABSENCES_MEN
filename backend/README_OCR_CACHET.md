# OCR du cachet — nom et fonction du signataire

Le traitement OCR lit désormais aussi la zone basse de chaque page (les cachets officiels se trouvent souvent dans cette zone), y compris dans les PDF qui disposent déjà d'une couche de texte sélectionnable. Plusieurs traitements de contraste sont essayés pour mieux faire ressortir les cachets bleus, rouges ou peu contrastés.

Le résultat de l'endpoint de scan `/api/decisions/scan/` contient, dans `donnees_extraites` :

- `signataire` : proposition automatique combinant la fonction et le nom lorsque le texte du cachet permet de les isoler ;
- `texte_cachet` : texte reconnu dans la zone ciblée, pour contrôle par la RH ;
- `avertissements` : avertissement explicite si le cachet n'est pas lisible ou si le signataire doit être confirmé.

La page RH préremplit alors le champ « Signataire » avec la proposition et affiche le texte brut détecté dans le cachet. La RH doit vérifier et corriger le nom/la fonction avant l'enregistrement. L'OCR n'est pas une preuve de l'identité du signataire.

## Dépendances

Python doit disposer de `pytesseract`, `Pillow` et `PyMuPDF` (déjà listés dans `requirements.txt`). L'exécutable Tesseract doit aussi être installé sur le serveur Windows/Linux et accessible via `PATH` ou `TESSERACT_CMD`. Le paquet de langue `fra` est recommandé. Si Tesseract ou la langue manque, le service le signale et laisse la saisie manuelle possible.

## Vérification

Le helper d'extraction du signataire est couvert par des tests unitaires dans `conges/tests.py`. Le traitement ne bloque jamais l'enregistrement : si le cachet est trop flou, trop pâle, recouvert par la signature ou situé hors de la zone détectée, le champ reste à vérifier/saisir manuellement.
