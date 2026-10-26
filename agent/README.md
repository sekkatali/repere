# Agent de prospection Repère

Tâche quotidienne (jours ouvrés, 8 h 41) qui :
1. met à jour le suivi (envoyés, réponses, STOP) dans le Google Sheet « Repère – Prospection restos » ;
2. parcourt une zone de France sur Google Maps (Claude in Chrome, sur l'ordinateur d'Ali) ;
3. lit les derniers avis de chaque resto et compte ceux restés sans réponse ;
4. trouve l'e-mail sur le site du resto (règles CNIL) ;
5. rédige un e-mail sur mesure pour les meilleurs prospects, en **brouillon** dans repereavis@gmail.com ;
6. envoie un compte rendu.

Rien n'est envoyé automatiquement : Ali relit et envoie les brouillons.

- `PROMPT_AGENT.md` : les consignes complètes de la tâche (scripts inclus).
- `liste_resultats.js`, `analyse_fiche.js`, `emails_site.js` : scripts exécutés dans les pages Google Maps et les sites des restos.
