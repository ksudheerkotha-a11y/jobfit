"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { Contact } from "@/lib/types";
import { SignIn } from "@/components/SignIn";
import { AppHeader } from "@/components/AppHeader";
import { ContactsManager } from "@/components/ContactsManager";
import { Logomark } from "@/components/icons";

// Per-user (auth session, contacts) — never static.
export const dynamic = "force-dynamic";

export default function Networking() {
  const { session, loadingSession } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoadingData(true);
    supabase
      .from("contacts")
      .select("id, name, company, context")
      .order("name")
      .then(({ data }) => {
        setContacts((data as Contact[]) ?? []);
        setLoadingData(false);
      });
  }, [session]);

  if (loadingSession) {
    return (
      <main className="container center-page">
        <div className="skeleton-spinner" aria-label="Loading" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container center-page">
        <div>
          <div className="brand brand-centered" style={{ marginBottom: "1.5rem" }}>
            <Logomark size={40} />
            <h1>jobfit</h1>
            <p className="tagline">Fewer, better, real job matches.</p>
          </div>
          <SignIn />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <AppHeader session={session} active="/networking" />

      {loadingData ? (
        <div className="card">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: "0.5rem" }} />
        </div>
      ) : (
        <ContactsManager userId={session.user.id} contacts={contacts} onContactsChange={setContacts} />
      )}
    </main>
  );
}
