"""Original selectable PDF for the demo. Requires reportlab; never embeds personal data."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import argparse

out = Path(__file__).resolve().parents[1] / 'starter-vault/03_PDF/主动回忆示例.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf', help='Path to a CJK TrueType font')
args = parser.parse_args()
pdfmetrics.registerFont(TTFont('DemoCJK', args.font))
c = canvas.Canvas(str(out), pagesize=(595, 842), invariant=1)
c.setTitle('Study Flow - Active Recall Demo')
c.setAuthor('Obsidian Study Flow Contributors')
for number, title, lines in [
    (1, '主动回忆：把阅读变成一次自测', [
        '主动回忆是在不看原文时，尝试从记忆中提取答案。',
        '重读容易产生熟悉感，熟悉并不代表能够独立回答。',
        '写一张好卡片：提出一个问题，用自己的话给出答案。',
        '',
        '练习：选中前两行，保存划线，写下自己的小结。',
        '勾选“同时生成记忆卡片”，再写一个可回忆的问题。',
        '例如：为什么看到一句话很熟悉，不等于真正记住了？',
    ]),
    (2, '间隔复习：下一次由卡片提醒你', [
        '复习时先回答，再显示答案，最后按实际回忆情况评分。',
        '能否脱离原文说清关键条件，比今天读了多少页更重要。',
        '读到这里，可以保存进度，下次从书架继续阅读。',
        '',
        '这是本项目原创的练习材料，允许随 MIT 项目复制。',
        '没有外部题库、个人笔记或收费教材内容。',
    ]),
]:
    c.setFillColor(HexColor('#f6f3ec')); c.rect(0, 0, 595, 842, fill=1, stroke=0)
    c.setFillColor(HexColor('#147d75')); c.setFont('Helvetica-Bold', 13)
    c.drawString(48, 774, 'OBSIDIAN STUDY FLOW / DEMO')
    c.setFillColor(HexColor('#1c3040')); c.setFont('DemoCJK', 23)
    c.drawString(48, 714, title)
    c.setFont('DemoCJK', 15)
    y=648
    for line in lines:
        c.drawString(48, y, line); y-=38
    c.setFillColor(HexColor('#63737c')); c.setFont('Helvetica', 11)
    c.drawString(48, 42, f'Original demo material | MIT | Page {number} / 2')
    c.showPage()
c.save()
print(out)
