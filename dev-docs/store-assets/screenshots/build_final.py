"""Builds App Store phone screenshots (1206x2622, iPhone 6.1"/6.3" slot; designed at 1320x2868 and downscaled) from raw/phone_*.png.
Re-run after swapping in higher-res raw captures: python build_final.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
W, H = 1320, 2868
BG = (11, 11, 13)
MINT = (52, 211, 153)
WHITE = (245, 247, 246)
FONT = "C:/Windows/Fonts/seguibl.ttf"

SHOTS = [
    ("phone_map", "Every cleanup,", "on the map"),
    ("phone_map_nyc", "Explore data by zip codes,", "neighborhoods, and more"),
    ("phone_groups", "Clean up with", "your crew"),
    ("phone_partners", "Earn perks at", "local shops"),
    ("phone_leaderboard", "See the neighbors", "making a difference"),
    ("phone_home", "Log it. Earn points.", "Get rewarded for it."),
    ("phone_campaigns", "Join a shared goal,", "make it count"),
]

SHOT_W = 1000
TOP = 520
BEZEL = 26
BAND = 96
OUTER_R = 150
SCREEN_R = OUTER_R - BEZEL
BODY = (8, 8, 10)
EDGE = (92, 96, 100)


# (top, bottom) of each leaderboard row in the raw capture, avatar + name column only
LB_ROWS = [(640, 693), (703, 757), (767, 821), (831, 885), (895, 949), (959, 1000)]


def blur_names(img):
    """Blur other users' avatars and names so no real identities ship in the listing."""
    for top, bot in LB_ROWS:
        box = (74, top, 345, min(bot, img.height))
        img.paste(img.crop(box).filter(ImageFilter.GaussianBlur(9)), box)
    return img


def background():
    bg = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(glow)
    d.ellipse((W // 2 - 700, -500, W // 2 + 700, 700), fill=(18, 78, 58))
    glow = glow.filter(ImageFilter.GaussianBlur(260))
    return Image.blend(bg, glow, 0.9)


def fit_font(text, max_w, start):
    size = start
    while size > 40:
        f = ImageFont.truetype(FONT, size)
        if f.getlength(text) <= max_w:
            return f
        size -= 4
    return ImageFont.truetype(FONT, size)


def build(stem, line1, line2):
    canvas = background().convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    size = min(fit_font(line1, W - 140, 118).size, fit_font(line2, W - 140, 118).size)
    f = ImageFont.truetype(FONT, size)
    for i, (txt, col) in enumerate(((line1, WHITE), (line2, MINT))):
        w = f.getlength(txt)
        draw.text(((W - w) / 2, 110 + i * (size + 22)), txt, font=f, fill=col)

    raw = Image.open(HERE / "raw" / f"{stem}.png").convert("RGB")
    if stem == "phone_leaderboard":
        raw = blur_names(raw)
    sh = round(raw.height * SHOT_W / raw.width)
    raw = raw.resize((SHOT_W, sh), Image.LANCZOS)
    max_sh = H - TOP - 50 - 2 * BEZEL - BAND
    if sh > max_sh:
        raw = raw.crop((0, 0, SHOT_W, max_sh))
        sh = max_sh
    scr_h = BAND + sh
    # screen = status band + screenshot
    screen = Image.new("RGB", (SHOT_W, scr_h), (10, 10, 12))
    screen.paste(raw, (0, BAND))
    ImageDraw.Draw(screen).rounded_rectangle((SHOT_W // 2 - 115, 26, SHOT_W // 2 + 115, 92), 33, fill=(0, 0, 0))
    # status bar glyphs
    sd = ImageDraw.Draw(screen)
    sf = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 40)
    sd.text((90, 36), "9:41", font=sf, fill=WHITE)
    for i, hh in enumerate((14, 22, 30, 38)):
        sd.rounded_rectangle((SHOT_W - 270 + i * 18, 76 - hh, SHOT_W - 262 + i * 18, 76), 3, fill=WHITE)
    sd.rounded_rectangle((SHOT_W - 170, 42, SHOT_W - 90, 76), 10, outline=(200, 200, 200), width=3)
    sd.rounded_rectangle((SHOT_W - 164, 48, SHOT_W - 112, 70), 6, fill=WHITE)

    ow, oh = SHOT_W + 2 * BEZEL, scr_h + 2 * BEZEL
    x0 = (W - ow) // 2
    sx = x0 + BEZEL
    # shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0, TOP + 24, x0 + ow, TOP + oh + 24), OUTER_R, fill=(0, 0, 0, 210))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(44)))
    # side buttons
    bd = ImageDraw.Draw(canvas)
    for yy, hh in ((TOP + 330, 70), (TOP + 470, 130), (TOP + 640, 130)):
        bd.rounded_rectangle((x0 - 9, yy, x0 + 6, yy + hh), 5, fill=EDGE)
    bd.rounded_rectangle((x0 + ow - 6, TOP + 520, x0 + ow + 9, TOP + 740), 5, fill=EDGE)
    # body: metal rim then black bezel
    bd.rounded_rectangle((x0, TOP, x0 + ow, TOP + oh), OUTER_R, fill=EDGE)
    bd.rounded_rectangle((x0 + 5, TOP + 5, x0 + ow - 5, TOP + oh - 5), OUTER_R - 5, fill=BODY)
    mask = Image.new("L", (SHOT_W, scr_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SHOT_W - 1, scr_h - 1), SCREEN_R, fill=255)
    canvas.paste(screen, (sx, TOP + BEZEL), mask)
    return canvas.convert("RGB")


if __name__ == "__main__":
    out = HERE / "final"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    for n, (stem, l1, l2) in enumerate(SHOTS, 1):
        img = build(stem, l1, l2)
        name = f"{n:02d}_{stem.replace('phone_', '')}.png"
        img.resize((1206, 2622), Image.LANCZOS).save(out / name)
        print("wrote", n, stem)
