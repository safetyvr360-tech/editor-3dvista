"""Extrae los objetos {…, "class":"X", …} de un script de 3DVista, respetando cadenas."""
import re, sys
def objetos(s, clase):
    pat = '"class":"%s"' % clase
    out = []
    for m in re.finditer(re.escape(pat) + r'(?=[,}])', s):
        i = m.start(); depth = 0; j = i
        # hacia atrás hasta la llave que abre este objeto
        k = i; d = 0; enstr = False
        while k > 0:
            k -= 1; ch = s[k]
            if ch == '"' and s[k-1] != '\\': enstr = not enstr; continue
            if enstr: continue
            if ch == '}': d += 1
            elif ch == '{':
                if d == 0: break
                d -= 1
        a = k; d = 0; enstr = False; k = a
        while k < len(s):
            ch = s[k]
            if ch == '"' and s[k-1] != '\\': enstr = not enstr
            elif not enstr:
                if ch == '{': d += 1
                elif ch == '}':
                    d -= 1
                    if d == 0: break
            k += 1
        out.append((a, k + 1, s[a:k + 1]))
    return out
