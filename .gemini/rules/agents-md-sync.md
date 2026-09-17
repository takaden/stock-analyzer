---
description: Always read and synchronize AGENTS.md upon code or architecture changes
globs: **/*
---

# AGENTS.md 読み込み・同期ルール

1. **作業開始時**:
   - プロジェクトに関する作業（機能追加、バグ修正、設計変更等）を始める前に、必ずルートディレクトリにある `AGENTS.md` を確認してください。
   - 特に「CORSプロキシ回避」「code-server absproxy設定」「J-Quants Lightプラン（60回/分、5年）」の制約を遵守してください。

2. **作業完了時**:
   - 新しいコンポーネントの追加、API仕様の変更、環境変数の追加、ライブラリの追加などを行った場合は、**タスク完了前に必ず `AGENTS.md` を最新の内容に更新・同期**してください。
