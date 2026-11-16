import os
import re
import json

app_dir = os.path.abspath(r'apps/web/src/app')
routes = []

def clean_quote(s):
    return s.replace('"', '').replace("'", "")

for root, dirs, files in os.walk(app_dir):
    for f in files:
        if f == 'page.tsx':
            full_path = os.path.join(root, f)
            rel = os.path.relpath(root, app_dir).replace('\\', '/')
            route_path = '/' + rel if rel != '.' else '/'
            # remove route groups like (auth), (public)
            route_path = re.sub(r'/\([^)]+\)', '', route_path)
            
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as fp:
                content = fp.read()
            
            use_api_calls = re.findall(r'useApi(?:\s*<[^>]+>)?\s*\(\s*([\'"`][^\'"`]+[\'"`])', content)
            api_calls = re.findall(r'api\.(get|post|put|patch|delete)\s*\(\s*([\'"`][^\'"`]+[\'"`])', content)
            fetch_calls = re.findall(r'fetch\s*\(\s*([\'"`][^\'"`]+[\'"`])', content)
            has_use_client = "'use client'" in content or '"use client"' in content
            
            role = 'PUBLIC'
            if route_path.startswith('/student'):
                role = 'STUDENT'
            elif route_path.startswith('/trainer'):
                role = 'TRAINER'
            elif route_path.startswith('/admin'):
                role = 'ADMIN'
            elif route_path.startswith('/hod'):
                role = 'HOD'
            elif route_path.startswith('/super-admin') or route_path.startswith('/super_admin'):
                role = 'SUPER_ADMIN'
            elif route_path.startswith('/operations-center'):
                role = 'OPS'
            
            api_clean = [f"{method} {clean_quote(path)}" for method, path in api_calls]
            routes.append({
                'route': route_path,
                'file': rel,
                'role': role,
                'use_client': has_use_client,
                'use_api': [clean_quote(c) for c in use_api_calls],
                'api': api_clean,
                'fetch': [clean_quote(f) for f in fetch_calls]
            })

print(f"Total routes found: {len(routes)}")
roles = {}
for r in routes:
    roles[r['role']] = roles.get(r['role'], 0) + 1
print("Routes by role:", json.dumps(roles, indent=2))

output_path = os.path.abspath('route_inventory.json')
with open(output_path, 'w', encoding='utf-8') as fp:
    json.dump(routes, fp, indent=2)
print(f"Saved inventory to {output_path}")

print("\n--- ROUTES WITH RAW FETCH ---")
for r in routes:
    if r['fetch']:
        print(f"[{r['role']}] {r['route']}: {r['fetch']}")

print("\n--- ROUTES WITHOUT EXPLICIT GET IN PAGE (NESTED COMPONENT OR PURE SHELL) ---")
for r in routes:
    has_get = bool(r['use_api']) or any(a.startswith('get') for a in r['api']) or bool(r['fetch'])
    if not has_get and r['role'] != 'PUBLIC':
        print(f"[{r['role']}] {r['route']} ({r['file']})")

