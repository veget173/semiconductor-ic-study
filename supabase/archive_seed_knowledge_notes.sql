-- Archive the broad built-in knowledge notes that were generated from the old seed list.
-- This does not physically delete rows.
update public.knowledge_notes
set archived = true,
    updated_at = now()
where title in (
  'CMOS 闩锁效应',
  'CMOS 反相器复习框架',
  'SRAM 读写操作',
  '差动放大器与 CMRR',
  '带隙基准核心公式'
);
