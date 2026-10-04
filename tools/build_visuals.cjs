// Original vector diagrams. Rendering optional: npm install --no-save sharp.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const font='Arial Unicode MS, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif';
const head=(w,h,title)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#607888" stroke-width="1.5"/></marker></defs><rect width="100%" height="100%" fill="#f7f5ee"/><g font-family="${font}">`;
const text=(x,y,value,size=23,color='#183747',weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}">${value}</text>`;
const box=(x,y,w,h,color,title,lines)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${color}" stroke="#d7e1df"/>${text(x+24,y+42,title,26,'#183747',700)}${lines.map((s,i)=>text(x+24,y+82+i*30,s,19,'#486273')).join('')}`;
const arrow=(d)=>`<path d="${d}" fill="none" stroke="#607888" stroke-width="2.5" marker-end="url(#arrow)"/>`;
let svg=head(1400,1040,'Obsidian Study Flow: content to memory');
svg+=text(64,60,'OBSIDIAN STUDY FLOW',18,'#147d75',700)+text(64,122,'把值得记住的内容，变成能检验自己的问题',38,'#183747',700);
svg+=text(64,164,'自己的脚本连接已有插件；学习数据留在 Markdown 中。',21,'#607888');
svg+=box(64,220,350,135,'#e7eee8','截图 / 复制文字',['题目与必要选项','截图在剪贴板，文字可修改']);
svg+=box(64,410,350,135,'#e7eee8','确认问题，写下答案',['选择复习卡组','取消或空输入，不生成卡片']);
svg+=arrow('M239 355 L239 402');
svg+=box(924,220,412,135,'#fff0c6','PDF 文字选区',['来自当前 PDF 的真实选区','保留页码和选区定位链接']);
svg+=box(924,410,412,165,'#fff0c6','写小结，保存学习卡',['原文 + 自己的理解','记录阅读过程，支持续读','仅摘录时，不进入间隔复习']);
svg+=arrow('M1130 355 L1130 402');
svg+=box(482,610,438,135,'#e3edf8','Markdown 记忆卡片',['一问一答，答案放在背面','PDF 卡片可回到原文选区']);
svg+=arrow('M239 545 L239 677 L474 677');
svg+=arrow('M1130 575 L1130 677 L928 677');
svg+=text(932,613,'勾选建卡 + 写问题',19,'#9c7831');
svg+=text(948,642,'再选择复习卡组',19,'#9c7831');
svg+=arrow('M701 745 L701 792');
svg+=box(482,800,438,132,'#dceee9','到期复习，先回忆再评分',['Spaced Repetition 安排下一次','普通 Markdown 保存调度日期']);
svg+=text(64,994,'执行入口：QuickAdd',20,'#147d75',700)+text(483,994,'PDF 选区与回链：PDF++',20,'#147d75',700)+text(925,994,'复习：Spaced Repetition',20,'#147d75',700)+'</g></svg>';
fs.writeFileSync(path.join(root,'docs/images/workflow.svg'),svg);
let quiz=head(1100,360,'Original question for screenshot card');
quiz+=text(32,50,'为什么看完一段话觉得熟悉，并不等于真正记住？',29,'#183747',700);
quiz+=text(32,122,'A. 因为阅读时间太短',27)+text(32,195,'B. 因为识别熟悉内容和脱离提示提取答案，是不同的任务',27)+text(32,268,'C. 因为每次必须背下整页原文',27);
quiz+=text(32,330,'STUDY FLOW · 原创练习题 · MIT',16,'#607888')+'</g></svg>';
fs.writeFileSync(path.join(root,'docs/images/example-question.svg'),quiz);
async function main(){
 let sharp;try{sharp=require('sharp');}catch{const runtime=process.env.STUDY_FLOW_NODE_MODULES;if(runtime)sharp=require(path.join(runtime,'sharp'));}
 if(sharp){await sharp(Buffer.from(svg)).png().toFile(path.join(root,'docs/images/workflow.png'));await sharp(Buffer.from(quiz)).png().toFile(path.join(require('node:os').tmpdir(),'study-flow-question.png'));}
 console.log('Original SVG diagrams written; PNG rendering '+(sharp?'complete':'skipped'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
