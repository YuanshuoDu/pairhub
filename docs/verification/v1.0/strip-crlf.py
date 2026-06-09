import sys
path = sys.argv[1]
with open(path, 'rb') as f:
    b = f.read()
cr = b.count(b'\r')
lf = b.count(b'\n')
crlf = b.count(b'\r\n')
print(f'CR={cr} LF={lf} CRLF={crlf}')
if cr > 0:
    b2 = b.replace(b'\r\n', b'\n')
    with open(path, 'wb') as f:
        f.write(b2)
    print('fixed')