<!-- GitHub 上で Mermaid 図を確認したい場合は、このファイルの内容をプレビューしてください -->

# システム構成図 (Mermaid)

以下の Mermaid 記法は GitHub の Markdown プレビューや VS Code の Mermaid 対応プラグインでそのまま描画できます。

```mermaid
flowchart TD
  Start[ケース生成リクエスト] -->|AI生成| CaseEngine[ISO7029ベース生成エンジン]
  CaseEngine --> Audiogram[Audiogram描画]
  Audiogram --> Tests[Tym / ART / DPOAE 自動生成]
  Tests --> AnswerCheck[答え合わせ表示]
  AnswerCheck --> End[学習者フィードバック]
```

## 表示方法

- GitHub リポジトリ上で `docs/system_diagram.md` を開き、「Raw」ではなく通常のビューを表示すると図がレンダリングされます。
- GitHub Pages や Vercel 上の Markdown ビューアでも Mermaid 対応であれば同様に描画されます。
- ローカルで確認したい場合は VS Code の「Markdown Preview Mermaid Support」などの拡張機能を利用してください。



