# 对话材料格式

现有课包仍兼容原来的 `title`、`audioSrc`、`segments` 结构。对话能力通过可选字段扩展，不要求迁移旧讲座。

## 单篇材料

```json
{
  "schemaVersion": 2,
  "id": "conversation-example",
  "title": "对话 · 示例",
  "category": "对话",
  "materialType": "conversation",
  "source": "来源说明",
  "audioSrc": "./conversation-example/audio.mp3",
  "speakers": [
    { "id": "speaker-a", "label": "角色 A", "role": "student" },
    { "id": "speaker-b", "label": "角色 B", "role": "staff" }
  ],
  "workflow": {
    "status": "draft",
    "editable": true,
    "reviewRequired": true
  },
  "segments": [
    {
      "id": "s001",
      "start": 0,
      "end": 2.5,
      "speakerId": "speaker-a",
      "speaker": "角色 A",
      "turnId": "t001",
      "text": "Example sentence."
    }
  ]
}
```

### 扩展字段

- `materialType`: `lecture`、`conversation`、`announcement` 或 `other`。
- `speakers`: 角色清单。`id` 用于稳定引用，`label` 用于页面显示，`role` 可按后续业务需求填写。
- `speakerId`: 当前句所属角色。
- `speaker`: 兼容旧页面的显示名称；导出时会与 `speakers` 同步。
- `turnId`: 多句属于同一轮发言时使用相同值。
- `workflow`: 人工校对状态和来源信息。允许继续添加业务字段。

未提供这些字段的旧课包会默认按讲座处理，原有听写、任务、进度和评分逻辑不变。

## 批量材料

老师端可一次导入多个单篇 JSON，也可导入或导出以下批量包装：

```json
{
  "schemaVersion": 1,
  "exportType": "listening-lms-material-batch",
  "exportedAt": "2026-07-29T00:00:00.000Z",
  "materials": []
}
```

批量格式只负责传输和人工校对，不改变每篇课包的独立结构。

## 老师端流程

1. 展开“材料校对与导出”。
2. 载入已有课包、新建对话，或多选导入 JSON。
3. 修改材料类型、角色、轮次、时间和文本。
4. 导出当前 JSON，或将当前草稿列表导出为批量 JSON。

编辑器不会直接修改线上文件或 Supabase 数据，导出的结果仍需经过人工确认后再加入 `library.json`。
