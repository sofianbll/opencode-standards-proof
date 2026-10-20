# Rejouer la preuve MCP Apps + Agent Plugins

Preuve expérimentale MCP Apps + Agent Plugins, pas une version publiée d'OpenCode/OpenChamber. **Aucune modification amont, aucune production.**

## Prérequis et builds patchés

Mac avec session graphique ouverte (Electron), Git, npm, Bun **1.4.x** (testé : 1.4.3) et Node **24+** sur le PATH. Sur ce Mac, ces outils sont dans `/opt/homebrew/bin` (prioritaire dans les shells de rejeu). Le runner utilise son Node **24.14.1** verrouillé ; Node 26 avait bloqué les traces localement. Sans Docker, clé, compte de modèle ni Thesys. L'installation télécharge sources, dépendances et Chromium ; le scénario utilise uniquement un faux LLM local, des profils jetables et aucun identifiant utilisateur.

Depuis la racine de ce dépôt, dans un shell neuf :

```sh
bash e2e/prepare.sh
```

Ce script récupère les bases exactes de [e2e/bases.env](e2e/bases.env) : OpenCode `6bac3b9ad8a3bed5ac01b8f6a3c30850a4d04685`, OpenChamber v2.5.0 `ad73d11a6e7cafa0880e238f92ba7cf5cf2cb1fd`, puis applique [patches/opencode](patches/opencode) et [patches/openchamber](patches/openchamber) avec `git am` dans `.build/` ignoré. Il installe les dépendances et construit le web ; le runner lance OpenCode depuis `.build/opencode/packages/cli/src/index.ts`, pas depuis un binaire publié. Il réutilise les checkouts existants : après changement de patchs, employer un checkout de preuve neuf plutôt qu'un `.build/` périmé. Aucun push amont.

## Serveur démo et configuration V2

Pour lancer le serveur seul, depuis `demo-server/`, shell neuf :

```sh
npm ci && node server.mjs
```

Serveur **stdio**, pas une URL : il attend un client MCP sur stdin ; stdout est réservé au protocole. Sans client et avec stdin fermé il s'arrête normalement. Le scénario ci-dessous le lance lui-même. [Contrat et inspection](demo-server/README.md). L'installation signale six vulnérabilités transitives de sévérité faible ; bundle épinglé non corrigé, contenu Lang fixe uniquement.

Pour un OpenCode **patché** personnel, installer les dépendances du serveur puis adapter le chemin absolu dans `opencode.jsonc` (ne pas modifier sa configuration pour le runner isolé) :

```jsonc
{
  "mcp": {
    "servers": {
      "demo": {
        "type": "local",
        "command": ["node", "/absolute/path/to/proof/demo-server/server.mjs"],
        "codemode": false
      }
    }
  }
}
```

Forme V2 vérifiée dans le fork : `packages/schema/src/config/mcp.ts` définit `servers`, et `packages/schema/src/mcp.ts` définit `LocalConfig`. Ce n'est pas l'ancienne forme `mcp.<name>` / `enabled`. `codemode:false` expose directement les outils de la démo ; autorisations habituelles toujours applicables.

## Web, contrôle négatif, desktop

Depuis la racine du dépôt, chaque commande dans un shell neuf :

```sh
bash e2e/run.sh
```

Deux scénarios Chromium doivent passer : le modèle appelle `show_demo_app`, la ligne d'outil est dépliée, la vraie carte **OpenUI counter** apparaît ; clic → compteur **0→1**, HTTP 200 et statut **App requested tool increment_counter**. Dans le second, **Permission required** est visible : refus → HTTP 403, compteur 0 ; nouvelle demande → **Allow once** → compteur 1, prouvant l'absence d'effet du refus. CSP : violations `connect-src` et `img-src`. Après navigation vers `about:blank`, statut **App navigated away — disabled**, aucun pont réactivable.

```sh
bash e2e/run.sh --negative
```

Même scénario avec callback bloqué : l'assertion **MCP callback must increment count** doit échouer. Le wrapper ne retourne succès que pour cet échec précis (un simple échec de démarrage ne suffit pas).

```sh
bash e2e/run.sh --desktop
```

Après préparation, réutilise le runtime Electron installé ; pas de téléchargement par cette commande. Une vraie fenêtre Electron charge l'UI bundlée `openchamber-ui://`, sélectionne le projet jetable et reproduit rendu/clic/compteur 1/statut/CSP. L'auto-navigation externe est annulée nativement : document et compteur restent présents. **Pas de test desktop du dialogue de permission** ; celui-ci est prouvé sur le web uniquement.

Captures desktop : [démarrage](evidence/desktop/startup.png), [compteur 1](evidence/desktop/counter-1.png), [navigation annulée](evidence/desktop/navigation-blocked.png), [résultat et limites](evidence/desktop/NOTES.md). Le rejeu écrit `desktop-results/{startup.png,counter-1.png,navigation-blocked.png,result.json,trace.zip}` (ignorés). Web : `test-results/**/mcp-app.png`, `mcp-permission.png`, traces et rapport ; [CI workflow](https://github.com/sofianbll/opencode-standards-proof/actions/workflows/e2e.yml) (artefacts conservés 14 jours). Les logs/profils `.run/` restent privés et ignorés.

## Paquet Agent Plugins local

Le vrai paquet exécutable est [agent-plugin/](agent-plugin/README.md) : manifeste canonique 1.0.0, skill `proof-marker`, serveur MCP stdio `plugin_ping`. Ses dépendances sont installées par `prepare.sh`. Pour un OpenCode patché personnel, ajouter à la configuration V2 :

```jsonc
{ "plugins": ["/absolute/path/to/proof/agent-plugin"] }
```

Depuis la racine, dans un shell neuf :

```sh
node --test e2e/mock-llm.test.mjs e2e/agent-plugin.test.mjs
bash e2e/run.sh --plugins
```

Le premier valide les deux fichiers JSON contre les [schémas officiels embarqués](e2e/schemas/README.md), le frontmatter minimal de la skill et le mock. Le second lance le vrai OpenCode patché et le vrai processus MCP, sans navigateur : API `/api/plugin` → état **active** ; `/api/skill` → contenu `AGENT_PLUGIN_SKILL_PROOF_40993` ; `/api/mcp` → **connected** ; prompt au modèle local → `execute` natif Code Mode → `tools.proof.plugin_ping({})` → part d'outil **completed** contenant `AGENT_PLUGIN_MCP_PROOF_40993`. Le serveur vérifie également ROOT, cwd par défaut et DATA accessible en écriture avant la poignée de main. Une attente de 500 ms suit la connexion pour laisser passer le rafraîchissement natif du catalogue (debounce 100 ms).

Le même scénario retire ensuite `plugins` de la configuration jetable, appelle `/api/location/reload`, vérifie l'absence de la skill et du serveur, puis configure une copie au nom de manifeste invalide : état **failed** avec diagnostic, aucune skill ni serveur enregistrés. Aucun composant n'est copié dans la configuration OpenCode ; aucune modification du fork n'a été nécessaire. CI exécute explicitement `--plugins` en plus des scénarios MCP Apps.

La fixture historique du fork (`packages/core/test/fixture/agent-plugin/`, `server.cjs` absent) reste un test de configuration uniquement ; les 29 tests ciblés de #12 couvrent d'autres cas de discovery/module/reload. Ce scénario prouve **un paquet local stdio sur macOS et en CI Linux**, pas l'invocation de la skill par le modèle, une conformité complète du client, Windows, les transports HTTP/SSE, les politiques de refus d'intégration ou toutes les courses de rechargement.

## Limites et non-objectifs de cette preuve

- Sandbox d'extension opaque `allow-scripts` **≠ sandbox conforme MCP Apps** (pas de double frame). Aucune origine déclarée n'est accordée ; démo HTML fixe et de confiance uniquement.
- Sur le web, la CSP ne bloque pas l'auto-navigation externe : le pont est définitivement désactivé après navigation, sans prétendre empêcher la requête. Electron bloque en plus la navigation nativement.
- Le callback passe les permissions, est lié à l'agent du message d'origine via `messageID`, mais son résultat **n'est pas persisté comme part de message**. Replier/remonter l'outil perd l'état de la frame. Résolution UI limitée à `ui://` + MIME exact `text/html;profile=mcp-app` ; `resources/read` côté serveur soumis au contrôle `opencode_read_mcp_resource`.
- Hors périmètre : mobile, VS Code, `window.openai`, marketplace/catalogue, sandbox normative, OpenUI Gateway, clés Thesys/cloud externe ; mémoire, modèles, packs et pilotage. Pas de validation signée/packagée ni compatibilité générale MCP Apps.

## Exécuté le

Rejeu du **20 octobre 2026**, shells neufs, chemins de travail indiqués ci-dessus. Toutes les commandes ci-dessous terminent avec le code 0 (le contrôle négatif valide explicitement l'échec Playwright attendu).

| Commande exacte | Cwd | Résultat |
| --- | --- | --- |
| `bash e2e/prepare.sh` | racine | Succès : bases récupérées, patchs appliqués, dépendances et build web |
| `npm ci && node server.mjs` | `demo-server/` | Succès, sortie 0 (stdin fermé) |
| `bash e2e/run.sh` | racine | Succès : 2/2 scénarios, dont refus/approbation visibles et quarantaine |
| `bash e2e/run.sh --negative` | racine | Succès du contrôle : échec exact du compteur, `NEGATIVE VERIFIED` |
| `bash e2e/run.sh --desktop` | racine | `DESKTOP PASS` : compteur 1, CSP, navigation annulée, aucune erreur de page ni crash |
| `node --test e2e/mock-llm.test.mjs e2e/agent-plugin.test.mjs` | `../wt-ap` | 4/4 : schémas 1.0.0, skill minimale et modèle déterministe |
| `bash e2e/run.sh --plugins` | `../wt-ap` | `AGENT PLUGIN PASS`, `REMOVAL PASS`, `NEGATIVE PASS` : paquet actif, skill, MCP, modèle→outil réel, retrait et rejet atomique du manifeste invalide |
| `bash e2e/run.sh` | `../wt-ap` | Régression : 2/2 scénarios Chromium passent après l'extension du mock |
| `bash e2e/run.sh --negative` | `../wt-ap` | Régression : `NEGATIVE VERIFIED`, échec exact du compteur attendu |
