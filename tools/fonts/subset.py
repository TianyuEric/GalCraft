"""Subset a release font while retaining its copyright and license metadata."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).with_name('deps')))
from fontTools import subset
from fontTools.ttLib import TTFont

parser = argparse.ArgumentParser()
parser.add_argument('--font', required=True)
parser.add_argument('--text', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--family', required=True)
args = parser.parse_args()
text = Path(args.text).read_text(encoding='utf-8')
font = TTFont(args.font, recalcTimestamp=False)
available = set(font.getBestCmap())
missing = sorted(set(ord(char) for char in text if not char.isspace()) - available)
options = subset.Options()
options.name_IDs = ['*']
options.name_languages = ['*']
options.name_legacy = True
worker = subset.Subsetter(options=options)
worker.populate(text=text)
worker.subset(font)
for entry in font['name'].names:
    if entry.nameID in (1, 4, 6, 16):
        family = args.family.replace(' ', '-') if entry.nameID == 6 else args.family
        entry.string = family.encode(entry.getEncoding())
font.save(args.output)
print(json.dumps({'glyphs': len(font.getBestCmap()), 'missing': missing}))
