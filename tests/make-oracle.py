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
with open(os.path.join(here, "oracle.json"), "w", encoding="utf-8") as f:
    json.dump(cases, f, ensure_ascii=False, indent=0)
print(f"{len(cases)} 件を書き出しました")
