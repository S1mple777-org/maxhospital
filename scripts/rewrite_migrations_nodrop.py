"""Rewrite drizzle migrations 0000-0004 for a FRESH database without DROP statements.
Same end state:
- DROP ... IF EXISTS for objects created later in the same run are no-ops -> removed.
- Policies that really exist are changed with ALTER POLICY instead of DROP + CREATE.
- Old create_consultation(uuid) / create_consultation_on_credit(uuid) are never created
  (0004 replaces them with new signatures), so no DROP FUNCTION is needed.
- ai_chat_logs mode check is created with 'lab' from the start.
"""
import re, sys, pathlib

src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)

# policies that already exist when the DROP runs -> convert following CREATE to ALTER
REAL = {
    ("Doctors can view own prescriptions", "prescriptions"),
    ("Patients can create ratings", "consultation_ratings"),
    ("Participants can send messages", "messages"),
}
# policies dropped without being re-created
NEUTRALIZE = {
    "Users can create consultations": 'ALTER POLICY "Users can create consultations" ON public.consultations WITH CHECK (false);',
    "Patients can update own consultations": 'ALTER POLICY "Patients can update own consultations" ON public.consultations USING (false) WITH CHECK (false);',
}

def drop_old_fn(sql: str, name: str) -> str:
    # remove CREATE OR REPLACE FUNCTION public.<name>(_doctor_id uuid) ... END; $$;
    sql = re.sub(r"CREATE OR REPLACE FUNCTION public\.%s\(_doctor_id uuid\)\n.*?\nEND; \$\$;\n" % name, "", sql, flags=re.S)
    sql = re.sub(r"^(REVOKE|GRANT) EXECUTE ON FUNCTION public\.%s\(uuid\).*\n" % name, "", sql, flags=re.M)
    return sql

for f in sorted(src.glob("000[0-4]_*.sql")):
    sql = f.read_text()
    if f.name.startswith("0001"):
        sql = sql.replace("CHECK (mode IN ('chat', 'trends'))", "CHECK (mode IN ('chat', 'trends', 'lab'))")
    if f.name.startswith("0003"):
        sql = re.sub(r"^ALTER TABLE public\.ai_chat_logs (DROP|ADD) CONSTRAINT .*ai_chat_logs_mode_check.*\n", "", sql, flags=re.M)
    if f.name.startswith(("0000", "0003")):
        sql = drop_old_fn(sql, "create_consultation")
        sql = drop_old_fn(sql, "create_consultation_on_credit")
    sql = re.sub(r"^DROP FUNCTION IF EXISTS public\.create_consultation(_on_credit)?\(uuid\);\n", "", sql, flags=re.M)
    sql = re.sub(r"^DROP TRIGGER IF EXISTS .*\n", "", sql, flags=re.M)

    def pol(m):
        name, table = m.group(1), m.group(2).split(".")[-1]
        if name in NEUTRALIZE:
            return NEUTRALIZE[name] + "\n"
        if (name, table) in REAL:
            return "--ALTER_NEXT\n"
        return ""
    sql = re.sub(r'^DROP POLICY IF EXISTS "([^"]+)" ON ([\w.]+);\n', pol, sql, flags=re.M)
    # CREATE POLICY "x" ON t FOR CMD TO r ...  ->  ALTER POLICY "x" ON t TO r ...
    sql = re.sub(r'--ALTER_NEXT\nCREATE POLICY ("[^"]+") ON ([\w.]+)\s+FOR \w+\s+', r"ALTER POLICY \1 ON \2 ", sql)
    assert "--ALTER_NEXT" not in sql, f.name
    leftover = re.findall(r"^\s*(DROP|TRUNCATE)\b.*$", sql, flags=re.M | re.I)
    assert not leftover, (f.name, leftover)
    (out / f.name).write_text(sql)
    print(f.name, len(sql))
