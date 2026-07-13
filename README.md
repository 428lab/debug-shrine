# debug-shrine

🔗 **Live:** https://d-shrine.jp

## Build

```bash
docker-compose build
docker-compose up
```
開発内容に応じて`docker-compose.yml`の`command`を編集してください  
また、`docker-compose.yml`は開発用です

## デプロイフロー

デプロイは**ブランチ駆動**で行われる。`main` へのマージだけでは環境に反映されない。

| ブランチ | 役割 | 発火するワークフロー |
|---|---|---|
| `main` | 開発の本流 | `setup.yml`(CI: build/test のみ) |
| `env/dev` | dev環境 | `dev-deploy.yml`(pushでdev環境へ自動デプロイ) |
| `env/prod` | 本番 | `prod-deploy.yml`(pushで本番へ自動デプロイ) |

### リリース手順

1. featureブランチ → `main` へPR(通常の開発)
2. `main` → `env/dev` へPRを作成しマージ → dev環境へ自動デプロイされる
   ```bash
   gh pr create --base env/dev --head main --title "Merge: main -> env/dev (変更概要)"
   ```
3. dev環境で動作確認する
4. `env/dev` → `env/prod` へPRを作成しマージ → 本番へ自動デプロイされる
   ```bash
   gh pr create --base env/prod --head env/dev --title "Merge: env/dev -> env/prod (変更概要)"
   ```
5. Actionsで `prod-deploy` の成功を確認する
   ```bash
   gh run list --workflow prod-deploy.yml --limit 1
   ```

デプロイの所要時間は dev / prod とも8分前後。
