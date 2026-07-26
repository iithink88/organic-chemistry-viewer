---
name: organic-chemistry-viewer
description: 根据用户的有机化学描述（如"解释乙醇和二甲醚的差别"），生成可交互的3D分子可视化页面，支持多分子对比、属性展示和官能团高亮。适用于有机化学教学、分子结构对比、同分异构体分析等场景。
dependency:
  python:
    - requests>=2.28.0
  system:
    - mkdir -p extra-files/input
---

# 有机化学交互可视化生成器

## 智能体系统提示词

当你被调用生成有机化学交互页面时，你扮演一个资深的有机化学专家和数据结构分析师。你的核心任务是：

1. **理解用户的有机化学问题**（如"解释乙醇和二甲醚的差别"、"展示阿司匹林的结构"等）
2. **预处理分子信息**（智能体能力）：
   - 将中文名称翻译为英文名称（使用你的语言理解能力）
   - 通过搜索互联网查找该分子的PubChem CID
   - 确定SMILES字符串（参考references/sdf-format.md）
3. **调用脚本生成SDF和属性数据**：使用英文名称和CID调用`scripts/generate_sdf.py`
4. **生成CHEM_CONFIG JSON对象**：遵循[references/llm-prompt-template.md](references/llm-prompt-template.md)中的完整规范
5. **生成最终HTML文件**：读取`assets/template.html`，将 `<script src="data.js"></script>` 替换为内嵌的 `<script>const CHEM_CONFIG = {...};</script>`，输出完整的HTML内容

详细的输出格式、处理规则、数据准确性要求请严格遵循：
👉 **[智能体逻辑命令模板](references/llm-prompt-template.md)**

---

## 任务目标
- 本Skill用于：根据用户对有机化学内容的描述，生成可交互的3D分子可视化HTML页面
- 能力包含：
  - 理解有机化学概念和分子结构关系
  - 为多个分子生成3D坐标数据（SDF格式）
  - 生成对比性的分析文本和属性数据
  - 创建可旋转、可交互的分子展示页面
- 触发条件：用户描述有机化学相关内容、询问分子差异、需要结构可视化时

## 前置准备
- 依赖说明：
  - requests：调用PubChem API获取准确的SDF和化学属性（推荐；若 Python 网络被限流返回 503，改用下方 Node 备选脚本）
  - node：可选，运行 `scripts/fetch_pubchem_node.js` 抓取（在 Python 访问 PubChem 受限时作为可靠替代）
  - rdkit：本地生成3D坐标（可选，作为PubChem的回退方案）
  ```
  requests>=2.28.0
  rdkit>=2023.9.1  # 可选，作为回退方案
  ```

## 操作步骤

### 1. 理解用户需求并识别分子
分析用户的描述，识别涉及的有机分子：
- 提取分子名称或化学式
- 理解用户关注的结构特征或性质差异
- 确定对比的主题（如：官能团差异、同分异构体、反应类型等）

**示例分析**：
- 用户说"解释乙醇和二甲醚的差别" → 识别为同分异构体对比，需展示C2H6O的两种结构
- 用户说"为什么顺-2-丁烯沸点比反式高" → 识别为几何异构体对比，需展示顺反构型

### 2. 生成SDF格式3D坐标和化学属性
为每个识别出的分子调用脚本生成SDF数据：

```bash
python scripts/generate_sdf.py "乙醇" --smiles "CCO" --properties --json-output
```

**脚本参数**：
- `identifier`（必需）：分子名称、CID或SMILES字符串
- `--smiles`（可选）：SMILES字符串（用于RDKit回退，当identifier是中文名称时推荐提供）
- `--properties`（可选）：获取化学属性（推荐使用）
- `--json-output`（可选）：以JSON格式输出（包含sdf和properties字段）
- `--no-optimize`（可选）：跳过RDKit几何构型优化

**数据获取策略**：
脚本优先使用PubChem API获取数据：
1. 通过分子名称或SMILES搜索PubChem CID
2. 使用CID获取3D SDF坐标（`record_type=3d`）
3. 使用CID获取准确的化学属性（沸点、分子量、IUPAC名称等）
4. 如果PubChem查询失败，自动回退到RDKit生成

**重要说明**：
- RDKit是可选依赖，脚本已实现延迟导入
- 即使RDKit不可用，脚本仍可通过PubChem API正常工作
- 脚本会自动处理所有错误情况，智能体无需手动处理RDKit依赖
- 如果PubChem和RDKit都失败，脚本会输出明确的错误信息

**⚠️ 备选方案（Python 网络受限 / 返回 503 时）**：
- 现象：在部分受限 / 沙箱环境中，`generate_sdf.py` 通过 Python 访问 PubChem 会被限流，
  返回 `503 ServerBusy` 或连接被重置，导致 `sdf` / `properties` 为空，最终 HTML 无分子。
- 解决：改用本技能附带的 **Node.js 备选脚本** `scripts/fetch_pubchem_node.js`
  （PubChem 对 Node 出站请求稳定返回 200）。用法：
  ```bash
  # 1) 准备分子清单 molecules.json：
  # [ { "cid": 702, "name": "乙醇 (Ethanol)", "smiles": "CCO", "highlight": [0,8] },
  #   { "cid": 8254, "name": "二甲醚 (Dimethyl Ether)", "smiles": "COC", "highlight": [0] } ]
  # 2) 用 Node 抓取（输出 pubchem_data.json，结构与 generate_sdf.py 的 JSON 完全一致）
  node scripts/fetch_pubchem_node.js molecules.json pubchem_data.json
  ```
- 抓到 `pubchem_data.json` 后，按相同逻辑提取 `sdf` / `properties` 组装 CHEM_CONFIG 即可，
  后续流程（步骤 3、4）无需改动。详见 [references/troubleshooting.md](references/troubleshooting.md) 问题5。

**常见分子的SMILES**：
- 乙醇：`CCO`
- 二甲醚：`COC`
- 顺-2-丁烯：`C/C=C\C`
- 反-2-丁烯：`C/C=C/C`
- 更多参考：[references/sdf-format.md](references/sdf-format.md)

**输出格式（JSON）**：
```json
{
  "sdf": "完整的SDF字符串",
  "properties": {
    "MolecularFormula": "C2H6O",
    "MolecularWeight": 46.069,
    "BoilingPoint": "78.37 °C",
    "XLogP3": "-0.1",
    "IUPACName": "ethanol"
  },
  "source": "pubchem",
  "cid": 702
}
```

**操作要点**：
- 每个分子调用一次脚本
- 使用`--json-output`获取结构化数据
- 从JSON中提取sdf和properties字段
- 检查source字段确认数据来源（pubchem或rdkit）

### 3. 生成页面配置数据
组装CHEM_CONFIG JSON对象，包含以下字段：

#### topic（页面主标题）
- 描述对比主题或学习目标
- 示例：`"同分异构体对比：乙醇 vs 二甲醚"`

#### description（描述文本）
- 简要说明学习目标和对比重点
- 示例：`"通过对比C2H6O的两种同分异构体，理解官能团差异如何影响物理化学性质。"`

#### molecules（分子数组）
每个分子对象包含：

**id**（唯一标识符）
- 简短标识，如`"ethanol"`、`"dimethyl-ether"`

**name**（分子名称）
- IUPAC名称或常用名，如`"乙醇 (Ethanol)"`

**formula**（分子式）
- 化学式，使用Unicode下标，如`"C₂H₆O"`、`"C₄H₈"`
- 可从脚本输出的`properties.MolecularFormula`获取

**sdf**（SDF格式数据）
- 从脚本输出的`sdf`字段获取

**properties**（属性数组）
- 键值对列表，从脚本输出的`properties`字段映射而来
- 推荐的属性映射：
  ```json
  [
    { "label": "分子式", "value": properties.MolecularFormula },
    { "label": "分子量", "value": properties.MolecularWeight + " g/mol" },
    { "label": "沸点", "value": properties.BoilingPoint || "未知" },
    { "label": "IUPAC名称", "value": properties.IUPACName || "未知" }
  ]
  ```
- 根据可用属性动态调整（如XLogP3、MeltingPoint等）

**analysis**（分析文本）
- 深入解析结构特点、性质关系
- 可结合脚本获取的属性数据进行分析
- 示例：`"乙醇含羟基，可形成分子间氢键，因此沸点较高；二甲醚为醚键，极性较弱，沸点较低。"`

**highlights**（高亮原子索引数组）
- 标记官能团或关键原子的索引（从0开始）
- 示例：羟基高亮`[8, 9]`（羟基的O和H）

**原子索引查找方法**：
- SDF文件的原子块从第4行开始
- 第4行=索引0，第5行=索引1，依此类推
- 需要根据分子结构确定需要高亮的原子位置
- 简短标识，如`"ethanol"`、`"dimethyl-ether"`

**name**（分子名称）
- IUPAC名称或常用名，如`"乙醇 (Ethanol)"`

**formula**（分子式）
- 化学式，使用Unicode下标，如`"C₂H₆O"`、`"C₄H₈"`

**sdf**（SDF格式数据）
- 从脚本获取的完整SDF字符串，用反引号包裹

**properties**（属性数组）
- 键值对列表，展示关键性质
```json
[
  { "label": "沸点", "value": "78.4 °C" },
  { "label": "极性", "value": "高（含羟基）" }
]
```

**analysis**（分析文本）
- 深入解析结构特点、性质关系
- 示例：`"乙醇含羟基，可形成分子间氢键，因此沸点较高；二甲醚为醚键，极性较弱，沸点较低。"`

**highlights**（高亮原子索引数组）
- 标记官能团或关键原子的索引（从0开始）
- 示例：羟基高亮`[8, 9]`（羟基的O和H）

**原子索引查找方法**：
- SDF文件的原子块从第4行开始
- 第4行=索引0，第5行=索引1，依此类推
- 需要根据分子结构确定需要高亮的原子位置

### 4. 生成最终HTML页面
生成完整的HTML文件，将data.js数据内嵌到template.html中：

**步骤4.1：读取HTML模板**
```bash
# 读取 assets/template.html 的完整内容
```

**步骤4.2：生成CHEM_CONFIG JSON**
根据步骤3生成的分子数据，组装CHEM_CONFIG对象：
```json
const CHEM_CONFIG = {
  "topic": "同分异构体对比：乙醇 vs 二甲醚",
  "description": "通过对比C2H6O的两种同分异构体，理解官能团差异如何影响物理化学性质。",
  "molecules": [
    {
      "id": "ethanol",
      "name": "乙醇 (Ethanol)",
      "formula": "C₂H₆O",
      "sdf": "完整的SDF字符串（从脚本输出获取）",
      "properties": [
        {"label": "分子式", "value": "C₂H₆O"},
        {"label": "分子量", "value": "46.069 g/mol"},
        {"label": "沸点", "value": "78.37 °C"}
      ],
      "analysis": "乙醇含羟基，可形成分子间氢键，因此沸点较高；二甲醚为醚键，极性较弱，沸点较低。",
      "highlights": [0, 8]
    },
    {
      "id": "dimethyl-ether",
      "name": "二甲醚 (Dimethyl Ether)",
      "formula": "C₂H₆O",
      "sdf": "完整的SDF字符串（从脚本输出获取）",
      "properties": [
        {"label": "分子式", "value": "C₂H₆O"},
        {"label": "分子量", "value": "46.069 g/mol"},
        {"label": "沸点", "value": "-24.8 °C"}
      ],
      "analysis": "二甲醚为醚键结构，无法形成分子间氢键，因此沸点显著低于乙醇。",
      "highlights": [0]
    }
  ]
}
```

**步骤4.3：替换模板中的data.js引用**
将模板中的 `<script src="data.js"></script>` 替换为内嵌的CHEM_CONFIG：
```html
<!-- 原始 -->
<script src="data.js"></script>

<!-- 替换为 -->
<script>
const CHEM_CONFIG = {/* JSON对象 */};
</script>
```

**步骤4.4：输出完整HTML**
输出替换后的完整HTML内容，用户可直接在浏览器中打开。

### 5. 验证输出
检查生成的HTML：
- JSON格式是否正确
- SDF数据是否完整
- 属性值是否有意义
- 分析文本是否准确

## 资源索引
- 核心脚本：[scripts/generate_sdf.py](scripts/generate_sdf.py)（用途：优先使用PubChem API获取3D SDF坐标和化学属性，失败时回退到RDKit生成）
- 备选脚本：[scripts/fetch_pubchem_node.js](scripts/fetch_pubchem_node.js)（用途：当 Python 环境访问 PubChem 被限流返回 503 / SDF 为空时，改用 Node.js 抓取，产物结构兼容）
- 智能体逻辑命令：[references/llm-prompt-template.md](references/llm-prompt-template.md)（用途：智能体生成CHEM_CONFIG JSON时的系统提示词）
- 格式参考：[references/sdf-format.md](references/sdf-format.md)（何时读取：查找SMILES示例、理解原子索引）
- HTML模板：[assets/template.html](assets/template.html)（直接用于生成最终页面）

## 数据准确性保障

### PubChem API集成
脚本已集成PubChem PUG REST API，提供以下保障：

1. **3D坐标准确性**：
   - 从PubChem获取实验测定或优化的3D构象（`record_type=3d`）
   - 优先使用权威数据源

2. **化学属性准确性**：
   - MolecularFormula（分子式）、MolecularWeight（分子量）
   - IUPACName（IUPAC名称）
   - ExactMass、MonoisotopicMass（精确质量）
   - HBondDonorCount、HBondAcceptorCount（氢键供体/受体）
   - RotatableBondCount、HeavyAtomCount（可旋转键/重原子）

3. **查询策略（智能体预处理 + 脚本）**：
   - **智能体预处理**：
     - 将中文名称翻译为英文名称
     - 搜索互联网查找PubChem CID
     - 确定SMILES字符串
   - **脚本执行**：
     - **优先级1**：使用CID查询（最准确）
     - **优先级2**：使用英文名称+SMILES查询
     - **回退**：PubChem失败时使用RDKit生成

4. **重要说明**：
   - 脚本不再内置翻译功能或名称映射表
   - 智能体必须在调用脚本前完成翻译和CID搜索
   - 推荐优先使用CID，确保数据准确性

### 使用建议
- **最佳实践（智能体预处理后）**：使用CID查询
  ```bash
  python scripts/generate_sdf.py "702" --properties --json-output
  ```
- **可靠回退**：使用英文名称+SMILES
  ```bash
  python scripts/generate_sdf.py "ethanol" --smiles "CCO" --properties --json-output
  ```
- **属性获取**：始终使用`--properties --json-output`获取准确数据

## 智能体执行逻辑

当接收到用户的有机化学描述后，智能体按以下步骤执行：

### 步骤1：理解用户需求并识别分子
分析用户的描述，提取关键信息：
- 涉及的分子名称或化学式
- 对比类型（同分异构体、几何异构体、官能团差异等）
- 用户关注的性质或结构特征

### 步骤2：预处理分子信息（智能体能力）
对每个识别出的分子执行：

**a) 名称翻译**：
- 如果是中文名称，使用你的语言能力翻译为准确的英文名称
- 确保使用标准的化学命名（如"ethanol"、"dimethyl ether"、"cis-2-butene"）

**b) 搜索PubChem CID**：
- 使用你的搜索能力，搜索互联网查找该分子的PubChem CID
- 搜索关键词："[英文名称] PubChem CID" 或 "PubChem [英文名称]"
- 示例：搜索"ethanol PubChem CID"得到CID 702
- 如果搜索不到CID，使用SMILES作为回退方案

**c) 确定SMILES**：
- 参考references/sdf-format.md中的SMILES示例
- 或使用你的化学知识生成正确的SMILES表示

### 步骤3：调用脚本生成SDF和属性数据
使用预处理后的CID或英文名称调用脚本：

```bash
# 优先使用CID查询（最准确）
python scripts/generate_sdf.py "702" --properties --json-output

# 或使用英文名称+SMILES
python scripts/generate_sdf.py "ethanol" --smiles "CCO" --properties --json-output

# 或仅使用SMILES作为回退
python scripts/generate_sdf.py "CCO" --properties --json-output
```

解析脚本输出的JSON，提取：
- `sdf`：3D分子坐标
- `properties`：化学属性（分子式、分子量、IUPAC名称等）
- `source`：数据来源（pubchem或rdkit）
- `cid`：PubChem CID（如果有）

### 步骤4：生成CHEM_CONFIG JSON对象
遵循[references/llm-prompt-template.md](references/llm-prompt-template.md)中的规范，组装JSON：
- topic：描述页面主题
- description：科学综述，可使用LaTeX语法
- molecules：分子对象数组，每个包含sdf、properties（从脚本获取准确数据）、analysis、highlights

### 步骤5：生成最终HTML文件
1. 读取 `assets/template.html` 的完整内容
2. 将 `<script src="data.js"></script>` 替换为内嵌的 `<script>const CHEM_CONFIG = {...};</script>`
3. 输出完整的HTML文件内容

## 注意事项
- SMILES字符串需要准确，错误会导致SDF生成失败
- 原子索引从0开始，高亮时需仔细核对
- properties中的label和value应简洁明确
- analysis应突出结构-性质关系，具有教学价值
- 对于复杂的立体化学，使用`/`和`\`标记顺反构型

## 使用示例

### 示例1：同分异构体对比
**用户请求**："解释乙醇和二甲醚的差别"

**智能体执行流程**：
1. 理解为同分异构体对比，识别分子：乙醇和二甲醚
2. 调用脚本生成SDF和属性：
   ```bash
   python scripts/generate_sdf.py "乙醇" --smiles "CCO" --properties --json-output
   python scripts/generate_sdf.py "二甲醚" --smiles "COC" --properties --json-output
   ```
3. 解析脚本输出，获取准确的化学属性（沸点、分子量、IUPAC名称等）
4. 生成CHEM_CONFIG，包括：
   - topic: "同分异构体对比：乙醇 vs 二甲醚"
   - properties: 从脚本获取的准确数据（沸点、分子式、分子量等）
   - highlights: 乙醇高亮羟基[0,8]，二甲醚高亮醚氧[0]（高亮索引需按 SDF 实际原子块确定：乙醇 O 为索引 0、其连接的羟基 H 为索引 8；二甲醚醚氧为索引 0）
5. 替换模板生成HTML

### 示例2：几何异构体对比
**用户请求**："为什么顺-2-丁烯沸点比反式高"

**智能体执行流程**：
1. 理解为几何异构体对比，识别分子：顺-2-丁烯和反-2-丁烯
2. 调用脚本生成SDF和属性：
   ```bash
   python scripts/generate_sdf.py "顺-2-丁烯" --smiles "C/C=C\C" --properties --json-output
   python scripts/generate_sdf.py "反-2-丁烯" --smiles "C/C=C/C" --properties --json-output
   ```
3. 生成CHEM_CONFIG，包括：
   - topic: "几何异构对比：顺-2-丁烯 vs 反-2-丁烯"
   - properties: 沸点、偶极矩、稳定性
   - highlights: 高亮双键碳原子[0,1]
4. 替换模板生成HTML