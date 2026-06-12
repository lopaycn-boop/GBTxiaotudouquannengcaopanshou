# GBT全能操盘手 — 操作验证+决策缓存+异常检测 设计文档

## 审计发现

### CRITICAL — 必须修复
1. **ai_trading_system/core/ 三个文件完全孤立** — 未被potato任何模块import，是死代码
   - multimodal_fusion.py: 硬编码confidence=0.6/0.7/0.8，灰色矩形当模板，未接入
   - pixel_precision_locator.py: 灰色模板填充fill(128)，_create_template造假数据
   - operation_verification_loop.py: 结构完整但未接入browser_cycle，重试机制不触发真实重执行

2. **demo模式无明确标识** — _demo_response()返回"demo":True但前端可能不展示这个警告

### HIGH — 需要改进
3. **browser_cycle无操作验证** — execute_browser_trade执行后不验证结果
4. **无决策缓存** — 相同市场信号每次都调LLM
5. **无异常检测** — 弹窗/验证码/页面无变化/超时无处理
6. **截图对比用固定阈值** — operation_verification_loop.py的0.1/0.9是硬编码

### MEDIUM
7. **TemplateMatcher._create_template造灰色矩形** — 根本不是真实模板
8. **ElementDetector用固定颜色阈值检测按钮** — 现代UI不适用
9. **操作重试不重执行** — _retry_operation只重验证，不重执行操作

## 设计方案

### 1. 操作验证闭环 (接入browser_cycle)

**核心改动：potato/browser/verify.py (新建)**

```
操作前截图 → 执行操作 → 操作后截图 → 差异检测 → 结果判定
    ↓              ↓           ↓
  baseline      execute    compare
                              ↓
                    PASS: 差异在预期范围
                    FAIL: 无变化→重试 / 弹窗→处理
```

- 基于SSIM的截图对比（真实计算，不是硬编码阈值）
- 每步浏览器操作前后自动截图
- 操作失败自动重试（真正重执行，不是重验证）
- 弹窗/对话框自动检测和处理

**接入点：potato/browser/actions.py的execute_browser_trade()**

### 2. 决策缓存层 (新建)

**potato/cache.py (新建)**

- 基于市场信号hash的决策缓存
- TTL自动过期（默认5分钟）
- 命中缓存直接返回，跳过LLM调用
- 缓存命中率统计

**接入点：potato/browser_cycle.py的Step 6分析阶段**

### 3. 异常检测系统 (新建)

**potato/browser/anomaly.py (新建)**

- 页面无变化检测（连续截图SSIM>0.98→操作未生效）
- 弹窗/对话框检测（DOM变化+特征词识别）
- 超时检测（操作超过阈值→中断+告警）
- 验证码检测（关键词匹配→暂停+通知用户）

**接入点：potato/browser/actions.py的每个操作步骤**

### 4. ai_trading_system/core 重构

**删除三个孤立文件，功能合并到potato核心：**
- multimodal_fusion.py → 删除，视觉识别用playwright的DOM+截图即可
- pixel_precision_locator.py → 删除，playwright已有精确定位
- operation_verification_loop.py → 重写为potato/browser/verify.py

## 技术约束

1. 不引入cv2/pytesseract等重依赖 — 用Pillow+SSIM替代
2. 不引入新ML模型 — 用规则引擎+截图对比
3. 所有置信度必须通过真实计算得出
4. demo模式数据必须在所有输出中明确标注⚠️
5. 每个新模块必须有测试
