"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Contact } from "@/lib/types";
import { UsersIcon } from "@/components/icons";

export function ContactsManager({
  userId,
  contacts,
  onContactsChange,
}: {
  userId: string;
  contacts: Contact[];
  onContactsChange: (contacts: Contact[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim() || !company.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("contacts")
      .insert({ user_id: userId, name: name.trim(), company: company.trim(), context: context.trim() })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onContactsChange([...contacts, data as Contact]);
    setName("");
    setCompany("");
    setContext("");
  }

  async function handleRemove(id: number) {
    const prev = contacts;
    onContactsChange(contacts.filter((c) => c.id !== id));
    const { error } = await supabase.from("contacts").delete().eq("id", id).eq("user_id", userId);
    if (error) onContactsChange(prev);
  }

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2 className="card-title-icon">
            <UsersIcon size={17} />
            Your network
          </h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            {contacts.length > 0
              ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"} — cross-checked against your shortlist`
              : "Add people you know at companies you're targeting — we'll flag it on matching roles"}
          </p>
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </div>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          {contacts.length > 0 && (
            <div className="contact-list">
              {contacts.map((c) => (
                <div className="contact-row" key={c.id}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="hint" style={{ margin: 0 }}>
                      {c.company}
                      {c.context ? ` · ${c.context}` : ""}
                    </div>
                  </div>
                  <button type="button" className="icon-link" onClick={() => handleRemove(c.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="contact-form">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="control-input"
            />
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company"
              className="control-input"
            />
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="How you know them (optional)"
              className="control-input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="primary"
              onClick={handleAdd}
              disabled={saving || !name.trim() || !company.trim()}
            >
              {saving ? "Adding..." : "Add contact"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
