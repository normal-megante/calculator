"""数の計算（js/num.js）の答え合わせ用データを作る。

Python の decimal（何桁でも正確に計算できる道具）で 120 桁まで計算した答えを
tests/oracle.json に書き出す。テスト（num.test.mjs）が、上から50桁を比べる。

使い方（calculator フォルダで）:
    python tests/make-oracle.py
"""
import json
import os
import random
from decimal import Decimal, getcontext
from fractions import Fraction

getcontext().prec = 120
random.seed(20261109)


def rand_dec():
    """いろいろな大きさの 10進数（文字）"""
    kind = random.random()
    if kind < 0.3:
        s = str(random.randint(1, 10 ** random.randint(1, 30)))
    elif kind < 0.7:
        s = f"{random.randint(0, 10 ** random.randint(0, 12))}.{random.randint(1, 10 ** random.randint(1, 20))}"
    else:
        s = f"0.{'0' * random.randint(0, 15)}{random.randint(1, 10 ** random.randint(1, 10))}"
    return s


def sci(d):
    """Decimal を「仮数の数字(60桁) と 指数」に（0.ddd × 10^exp）"""
    if d == 0:
        return {"digits": "0", "exp": 1, "neg": False}
    neg = d < 0
    d = abs(d)
    t = d.as_tuple()
    digits = "".join(map(str, t.digits))
    exp = len(digits) + t.exponent
    return {"digits": digits[:60], "exp": exp, "neg": neg}


cases = []
for _ in range(150):
    a = rand_dec()
    cases.append({"op": "sqrt", "a": a, "want": sci(Decimal(a).sqrt())})
for _ in range(150):
    a = rand_dec()
    b = f"{random.randint(0, 9)}.{random.randint(1, 10 ** random.randint(1, 6))}"
    if random.random() < 0.5:
        b = "-" + b
    want = Decimal(a) ** Decimal(b)
    cases.append({"op": "pow", "a": a, "b": b, "want": sci(want)})
for _ in range(80):
    a = rand_dec()
    cases.append({"op": "ln", "a": a, "want": sci(Decimal(a).ln())})
for _ in range(80):
    a = f"{random.randint(0, 200)}.{random.randint(1, 10 ** 8)}"
    if random.random() < 0.5:
        a = "-" + a
    cases.append({"op": "exp", "a": a, "want": sci(Decimal(a).exp())})
# 分数の正確な計算（Fraction で答え合わせ）
for _ in range(100):
    a, b = rand_dec(), rand_dec()
    fa, fb = Fraction(a), Fraction(b)
    for op, val in (("add", fa + fb), ("sub", fa - fb), ("mul", fa * fb), ("div", fa / fb)):
        cases.append({"op": op, "a": a, "b": b, "n": str(val.numerator), "d": str(val.denominator)})

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "oracle.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(cases, f, ensure_ascii=False, indent=0)
print(f"{len(cases)} 件を書き出しました")

# ---------------------------------------------------------
# 関数電卓（js/sci.js）の答え合わせ → tests/oracle-sci.json
#   三角関数は decimal にないので、級数で 250 桁まで計算する
# ---------------------------------------------------------
import math
import sys

sys.set_int_max_str_digits(0)

rng = random.Random(20261110)
getcontext().prec = 250


def pi_dec():
    def atan_inv(n):
        x = Decimal(1) / n
        x2 = x * x
        s, t, k = x, x, 1
        while True:
            t *= x2
            term = t / (2 * k + 1)
            if term == 0 or abs(term) < Decimal(10) ** -260:
                return s
            s += -term if k % 2 else term
            k += 1
    return 16 * atan_inv(5) - 4 * atan_inv(239)


PI = pi_dec()


def sin_cos(x):
    x = x % (2 * PI)
    s, c, ts, tc, i = x, Decimal(1), x, Decimal(1), 1
    while True:
        ts = -ts * x * x / ((2 * i) * (2 * i + 1))
        tc = -tc * x * x / ((2 * i - 1) * (2 * i))
        if abs(ts) < Decimal(10) ** -260 and abs(tc) < Decimal(10) ** -260:
            return s, c
        s += ts
        c += tc
        i += 1


def atan_dec(x):
    neg = x < 0
    x = abs(x)
    inv = x > 1
    if inv:
        x = 1 / x
    k = 0
    while x > Decimal("0.1"):
        x = x / (1 + (1 + x * x).sqrt())
        k += 1
    s, t, i = x, x, 1
    while True:
        t *= x * x
        term = t / (2 * i + 1)
        if term < Decimal(10) ** -260:
            break
        s += -term if i % 2 else term
        i += 1
    s *= 2 ** k
    if inv:
        s = PI / 2 - s
    return -s if neg else s


def short_dec(lo, hi, places):
    v = Decimal(rng.randint(lo * 10 ** places, hi * 10 ** places)) / Decimal(10) ** places
    return format(v, "f")


sci_cases = []
for _ in range(40):
    a = short_dec(-50, 50, rng.randint(0, 10))
    s, c = sin_cos(Decimal(a))
    sci_cases += [{"op": "sin", "angle": "rad", "a": a, "want": sci(s)},
                  {"op": "cos", "angle": "rad", "a": a, "want": sci(c)},
                  {"op": "tan", "angle": "rad", "a": a, "want": sci(s / c)}]
for _ in range(30):
    a = short_dec(-720, 720, rng.randint(1, 6))
    s, c = sin_cos(Decimal(a) * PI / 180)
    sci_cases += [{"op": "sin", "angle": "deg", "a": a, "want": sci(s)},
                  {"op": "tan", "angle": "deg", "a": a, "want": sci(s / c)}]
for _ in range(30):
    a = rand_dec()
    if rng.random() < 0.5:
        a = "-" + a
    sci_cases.append({"op": "atan", "angle": "rad", "a": a, "want": sci(atan_dec(Decimal(a)))})
for _ in range(30):
    a = short_dec(-1, 1, rng.randint(1, 8))
    x = Decimal(a)
    if abs(x) == 1:
        continue
    asin = atan_dec(x / (1 - x * x).sqrt())
    sci_cases += [{"op": "asin", "angle": "deg", "a": a, "want": sci(asin * 180 / PI)},
                  {"op": "acos", "angle": "rad", "a": a, "want": sci(PI / 2 - asin)}]
for _ in range(30):
    a = rand_dec()
    sci_cases.append({"op": "log10", "a": a, "want": sci(Decimal(a).log10())})
# 大きい階乗・nPr・nCr（Python の整数で正確に出して、上の桁をくらべる）
def int_want(v):
    s = str(v)
    return {"digits": s[:60], "exp": len(s), "neg": False}
sci_cases.append({"op": "fact", "a": "30000", "want": int_want(math.factorial(30000))})
sci_cases.append({"op": "fact", "a": "50000", "want": int_want(math.factorial(50000))})
sci_cases.append({"op": "nCr", "a": "100000", "b": "50000", "want": int_want(math.comb(100000, 50000))})
sci_cases.append({"op": "nPr", "a": "1000000", "b": "30000", "want": int_want(math.perm(1000000, 30000))})
sci_cases.append({"op": "nPr", "a": str(10 ** 60), "b": "2000", "want": int_want(math.perm(10 ** 60, 2000))})
sci_cases.append({"op": "nCr", "a": str(10 ** 60), "b": "1999", "want": int_want(math.comb(10 ** 60, 1999))})

with open(os.path.join(here, "oracle-sci.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(sci_cases, f, ensure_ascii=False, indent=0)
print(f"{len(sci_cases)} 件を書き出しました（関数電卓）")
