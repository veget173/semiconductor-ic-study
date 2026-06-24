# 半导体集成电路协作学习网站

一个给小组自用的课程协作学习网站。首屏是学习工作台，不是营销页；题库和知识库同等重要。未登录用户可以浏览，登录用户可以新增、编辑、上传图片，第一版不提供删除功能。

## 已基于当前资料识别

- 资料规模：PDF 43 个、PPTX 45 个、PPT 3 个、DOC/DOCX 10 个、图片 7 个、HTML 1 个。
- 章节主线：元器件与寄生效应、双极/CMOS 工艺、版图设计、TTL、MOS/CMOS 逻辑、动态逻辑、锁存器/触发器、SRAM、小信号放大、恒流源、有源负载、带隙基准、运放、开关电容。
- 题型：名词解释、简答题、计算题。
- 已整理为 seed 的题目候选来自作业 DOCX，真题 PDF 因文本抽取乱码先登记为待整理来源。
- 公式候选包括 MOS 饱和电流、跨导、输出电阻、CMRR、共源共栅输出阻抗、带隙基准、动态功耗、延迟近似式。

完整识别摘要在 `src/data/seed.js`，原始抽取结果在 `analysis_extract.json`。

## 功能

- Supabase Auth 邮箱登录。
- profiles 表保存昵称和 emoji 头像。
- 题库：新增、编辑、答案文字框、图片附件。
- 答案协作：每次提交答案会记录提交人昵称和 emoji 头像，也可标注为纠错或补充。
- 知识库：新增、编辑、正文/公式/图片/关联题目。
- 章节按课程 8 章组织，不再设置难度字段。
- 往年真题已先按年份和题型建立待整理题组，保留 PDF 来源，后续可上传截图并拆分成具体小题。
- 图片上传：Supabase Storage，上传后预览，点击放大。
- 图片记录支持“归档”而不是物理删除，并可一键复制 Markdown 图片引用。
- LaTeX：支持 `$...$` 和 `$$...$$`。
- 搜索筛选：章节、标签、题型、来源、关键词、待完善、无答案、无解析等。
- 刷题模式：展开答案、标记会了/不熟/不会、收藏题目，记录存在 localStorage。
- 深色/浅色/跟随系统主题切换。
- 知识点和题目可互相关联，详情页会显示关联内容。

## 本地运行

```bash
python -m http.server 5173
```

然后打开 `http://localhost:5173`。

未配置 Supabase 时，网站会显示本地 seed 预览。要启用真实保存，修改：

```js
// src/config.js
export const SUPABASE_URL = "https://你的项目.supabase.co";
export const SUPABASE_ANON_KEY = "你的 anon key";
export const STORAGE_BUCKET = "course-images";
```

## Supabase 配置

1. 新建 Supabase 项目。
2. 打开 SQL Editor，运行 `supabase/schema.sql`。
3. 可选运行 `supabase/seed.sql`，登记资料来源。
4. 在 Authentication -> Providers 开启 Email。
5. 在 Authentication -> URL Configuration 中加入本地和线上地址：
   - `http://localhost:5173`
   - Vercel 部署后的域名
6. SQL 会创建 public bucket `course-images`，图片公开读取，登录用户可上传和更新记录。

## RLS 规则

- 未登录用户可以读取 profiles、questions、knowledge_notes、sources、attachments 等公开内容。
- 登录用户可以 insert 和 update。
- 没有创建 delete policy，因此不能通过客户端删除题目、知识点、附件记录。
- profiles 只能由用户更新自己的昵称和 emoji 头像。
- 登录用户可以编辑别人创建的题目和知识点，适合小组协作补全。

## Vercel 部署

1. 把仓库推到 GitHub：`veget173/semiconductor-ic-study`。
2. 在 Vercel 导入该仓库。
3. Framework 选择 Other，Build Command 留空，Output Directory 留空或设为 `.`。
4. 部署后，把 Vercel 域名加入 Supabase Auth 的 Site URL / Redirect URLs。
5. 确认 `src/config.js` 已填 Supabase URL 和 anon key。anon key 可以公开，RLS 负责权限。

## 如何导入和补充资料

- 自动 seed：当前版本将可识别题干和知识点候选放在 `src/data/seed.js`，数据库为空时会显示为预览。
- 一键同步：配置 Supabase 并登录后，进入“登录/个人”页，点击“同步内置资料到数据库”，会把未重复的来源、题目和知识点写入数据库。内置资料来自当前项目文件夹中已解析的 PPT、作业和真题来源。
- 正式录入：登录后在网站中点击“新增题目”或“新增知识点”，把 seed 题目保存进 Supabase。
- 真题 PDF：多数抽取乱码，建议打开原 PDF 截图，上传为题目图片，并手动补录题干、年份、页码。
- PPT/课件截图：上传到题目或知识点附件，在正文中也可以使用 Markdown 图片语法引用。
- 旧版 `.ppt` / `.doc`：建议先另存为 `.pptx` / `.docx` 或 PDF，再重新解析。

## 未能完整解析的文件和原因

- `期末/2023-半导体集成电路-期末-无答案.pdf`、部分 2020/2021/2022 真题 PDF：文本抽取结果乱码或像扫描 OCR，已作为“待整理来源”。2025 试卷相关内容已按要求排除。
- `ppt wwp/10-2-CMOS集成电路工艺与版图.ppt`、`ppt wwp/32-半导体集成电路-差动放大器.ppt`、`ppt wwp/32-半导体集成电路-吉尔伯特单元.ppt`：旧版二进制 PPT，未做自动文本解析。
- `作业/第三章作业参考答案.doc`、`作业/第三章作业.doc`：旧版二进制 Word，未做自动文本解析。
