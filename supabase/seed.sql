-- Optional initial source rows. Questions/notes are also available as editable seed data in src/data/seed.js.
insert into public.sources(title, kind, path, parse_status, note)
values
  ('第一章作业', '作业', '作业/第一章作业.docx', '已识别', '题干可直接导入'),
  ('第二章作业', '作业', '作业/第二章作业20260330.docx', '已识别', '题干可直接导入'),
  ('第四章作业', '作业', '作业/第四章作业.docx', '已识别', '含动态逻辑、锁存器、SRAM'),
  ('第五章作业', '作业', '作业/第五章作业.docx', '已识别', '含小信号、差动放大、共源共栅计算题'),
  ('第六章作业', '作业', '作业/第六章作业.docx', '已识别', '含带隙基准、有源负载、恒流源'),
  ('2025 期末试卷回顾', '真题', '期末/2025-期末试卷回顾.pdf', '待整理', 'PDF 文本抽取乱码，建议人工截图录入'),
  ('2023 期末无答案', '真题', '期末/2023-半导体集成电路-期末-无答案.pdf', '待整理', 'PDF 文本抽取不稳定'),
  ('课程 PPT 第 1-8 章', 'PPT', 'ppt/*.pdf / ppt wwp/*.pptx', '已识别', '可作为章节与知识点来源')
on conflict do nothing;
