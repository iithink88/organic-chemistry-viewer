# 常见问题与故障排除

## 问题1：HTML无法渲染，显示语法错误

**症状**：浏览器控制台显示 `setBackgroundColor(0xfe, 0xf3, 0xc7)` 相关错误

**原因**：
- 这可能是旧版本HTML模板或浏览器缓存导致
- 当前版本的template.html使用的是正确的语法：`backgroundColor: 'white'`

**解决方案**：
1. 清除浏览器缓存，重新加载页面
2. 确认使用的是最新版本的Skill（`organic-chemistry-viewer.skill`）
3. 检查智能体输出的HTML，确保包含正确的`3Dmol.createViewer`调用

**正确的代码**：
```javascript
viewer = $3Dmol.createViewer($('#mol-viewer'), { backgroundColor: 'white' });
```

## 问题2：出现"由于当前环境缺少RDKit"错误

**症状**：智能体输出类似"由于当前环境缺少RDKit分子建模库，无法生成..."的错误信息

**原因**：
- **这个错误信息是由智能体生成的，不是脚本输出的**
- 脚本已实现RDKit延迟导入和自动回退机制
- 即使RDKit不可用，脚本仍可通过PubChem API正常工作

**解决方案**：
1. 确保智能体按照SKILL.md的指导正确使用脚本
2. 脚本会自动尝试多种数据源：
   - **优先级1**：PubChem API（最准确，不需要RDKit）
   - **优先级2**：RDKit本地生成（可选）
3. 如果智能体输出了这样的错误，说明智能体没有正确理解或执行脚本逻辑

**正确的工作流程**：
1. 智能体识别分子
2. 调用脚本：`python scripts/generate_sdf.py "分子名称" --properties --json-output`
3. 脚本自动从PubChem获取数据（不需要RDKit）
4. 如果PubChem失败且RDKit可用，使用RDKit生成
5. 如果RDKit不可用，脚本会输出警告但不影响PubChem数据

## 问题3：某些分子无法获取数据

**症状**：脚本返回空的SDF或properties

**可能原因**：
1. 分子名称或SMILES不正确
2. PubChem中暂无该分子的3D结构数据
3. 网络连接问题

**解决方案**：
1. **尝试不同的标识符**：
   - 使用CID（最推荐）
   - 使用英文名称
   - 使用SMILES
2. **检查SMILES格式**：
   - 参考references/sdf-format.md中的示例
   - 使用标准的SMILES表示法
3. **网络问题**：确保可以访问pubchem.ncbi.nlm.nih.gov

**示例**：
```bash
# 优先使用CID
python scripts/generate_sdf.py "702" --properties --json-output

# 使用英文名称+SMILES
python scripts/generate_sdf.py "ethanol" --smiles "CCO" --properties --json-output

# 仅使用SMILES
python scripts/generate_sdf.py "CCO" --properties --json-output
```

## 问题4：RDKit依赖问题

**症状**：安装RDKit失败或无法导入

**解决方案**：
- **RDKit是可选依赖**，不是必需的
- 只要能访问PubChem API，Skill就能正常工作
- 如果需要使用RDKit：
  ```bash
  # conda环境
  conda install -c conda-forge rdkit
  
  # pip环境（不推荐，可能有依赖问题）
  pip install rdkit
  ```

## 问题5：Python 调用 PubChem 返回 503 / SDF 或 properties 为空（网络被限流）

**症状**：运行 `python scripts/generate_sdf.py "CID" --properties --json-output` 后，
输出的 JSON 中 `sdf` 为空字符串、`properties` 为空对象或缺失、Source 为空；
最终生成的 HTML 里分子无法显示（3Dmol 无坐标可渲染）。

**原因**：
- 在部分受限 / 沙箱环境中，Python 进程的出站 HTTPS 请求会被网络策略限流，
  PubChem PUG REST API 直接返回 `503 ServerBusy` 或连接被重置，
  脚本将非 200 响应当作失败处理，于是返回空的 sdf / properties。
- 这是**环境网络限制**，不是脚本 bug，也不是分子数据缺失。

**解决方案（推荐：改用 Node.js 备选脚本）**：
1. 本技能已附带 `scripts/fetch_pubchem_node.js`，使用 Node.js 内置 https 抓取 PubChem，
   实测在同样的受限环境下对 PubChem 稳定返回 200。
2. 准备分子清单 `molecules.json`：
   ```json
   [
     { "cid": 702,  "name": "乙醇 (Ethanol)",          "smiles": "CCO",  "highlight": [0, 8] },
     { "cid": 8254, "name": "二甲醚 (Dimethyl Ether)", "smiles": "COC", "highlight": [0] }
   ]
   ```
3. 运行备选脚本（输出 `pubchem_data.json`，结构与 generate_sdf.py 的 JSON 完全一致）：
   ```bash
   node scripts/fetch_pubchem_node.js molecules.json pubchem_data.json
   ```
4. 从 `pubchem_data.json` 中按相同逻辑提取 `sdf` / `properties`，继续 SKILL.md 的步骤 3、4 组装 CHEM_CONFIG —— 后续流程无需改动。

**备选脚本特性**：
- 内置重试（指数退避）应对 503 / 429 / 网络抖动
- 自动把 PubChem 实验属性里的华氏温度换算为摄氏温度
- 产物字段：`name / cid / smiles / source / formula / sdf / properties / highlights`，可直接对接 CHEM_CONFIG

**验证是否踩到此坑**：
```bash
# 若下面这行返回的 JSON 中 sdf 字段为空字符串（""），说明 Python 被限流，改用 Node 备选脚本
python scripts/generate_sdf.py "702" --properties --json-output
```

## 验证脚本是否正常工作

运行以下命令测试脚本：

```bash
# 测试PubChem API（不需要RDKit）
python scripts/generate_sdf.py "ethanol" --properties --json-output

# 测试多分子模式
python scripts/generate_sdf.py "ethanol" "methanol" --properties --json-output

# 检查帮助信息
python scripts/generate_sdf.py --help
```

**预期结果**：
- 返回完整的JSON对象
- 包含sdf和properties字段
- source字段为"pubchem"（优先）或"rdkit"（回退）

## 联系与反馈

如果遇到上述文档未涵盖的问题，请提供以下信息：
1. 完整的错误信息
2. 使用的分子名称或SMILES
3. 脚本的完整输出
4. 浏览器控制台错误（如果是HTML渲染问题）
