# PROGRESS.md — uusd.ubq.fi

> 墨子 Harness · 自动生成于 2026-06-25

---

## ✅ 已完成

- Harness 初始化完成
- Bounty issue 已锁定：https://github.com/ubiquity/uusd.ubq.fi/issues/47
- 资产展示和交易下拉只保留价值大于 $1 的钱包资产
- 有钱包 inventory 数据时移除预加载 token 列表回退噪音
- 输入框新增 Max 按钮，可按当前方向填入最大可用余额
- 新增余额显示阈值测试
- type-check / test / lint / build 四条 Harness 命令全部通过

---

## 🔄 进行中

- 提交分支并创建 PR

---

## 📋 待办

- 提交分支并创建 PR

---

## ⚠️ 已知问题

- 本机没有全局 Deno；本地验证使用 `/tmp/deno-local/deno` 临时 binary 跑通项目原生 `deno task build`
