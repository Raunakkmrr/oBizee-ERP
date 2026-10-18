"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Plus, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { z } from "zod";
import { apiFetch, signOut } from "@/lib/api/client";
import { loadCaller, sessionLoadFailure, subscribeToSession } from "@/lib/api/session";
import { useCurrentUser, useSessionResolved } from "@/lib/data/use-session";
import { ROLE_LABELS } from "@/lib/roles";
import styles from "./workspace.module.css";

const customerSchema = z.object({ id: z.string().uuid(), name: z.string(), customerType: z.enum(["INDIVIDUAL", "BUSINESS"]), billingStateCode: z.string() });
const directorySchema = z.object({ items: z.array(customerSchema), page: z.number(), hasMore: z.boolean() });
const workspaceSchema = z.object({
  company: z.object({ id: z.string().uuid(), businessName: z.string(), legalName: z.string() }),
  branches: z.array(z.object({ id: z.string().uuid(), name: z.string(), stateCode: z.string() })),
  counts: z.object({ customers: z.number().int().nonnegative(), openJobs: z.number().int().nonnegative() }),
  jobs: z.array(z.object({ id: z.string().uuid(), number: z.string(), service: z.string(), status: z.string(), scheduledDate: z.string().nullable(), customer: z.string(), branch: z.string() })),
  access: z.object({ policy: z.string(), universal: z.boolean(), modules: z.array(z.string()) }),
  asOf: z.string(),
});
type Workspace = z.infer<typeof workspaceSchema>;
type Directory = z.infer<typeof directorySchema>;
type Load<T> = { principal: string; data?: T; error?: string };
const states = [["01","Jammu and Kashmir"],["02","Himachal Pradesh"],["03","Punjab"],["04","Chandigarh"],["05","Uttarakhand"],["06","Haryana"],["07","Delhi"],["08","Rajasthan"],["09","Uttar Pradesh"],["10","Bihar"],["11","Sikkim"],["12","Arunachal Pradesh"],["13","Nagaland"],["14","Manipur"],["15","Mizoram"],["16","Tripura"],["17","Meghalaya"],["18","Assam"],["19","West Bengal"],["20","Jharkhand"],["21","Odisha"],["22","Chhattisgarh"],["23","Madhya Pradesh"],["24","Gujarat"],["26","Dadra and Nagar Haveli and Daman and Diu"],["27","Maharashtra"],["29","Karnataka"],["30","Goa"],["31","Lakshadweep"],["32","Kerala"],["33","Tamil Nadu"],["34","Puducherry"],["35","Andaman and Nicobar Islands"],["36","Telangana"],["37","Andhra Pradesh"],["38","Ladakh"],["97","Other territory"]];
const upcoming = ["Leads & sales", "Dispatch & field service", "Contracts", "Invoices & collections", "Inventory", "Reports & GST", "People & payroll", "Settings"];
function message(error: unknown) {
  const app = (error as { appError?: { kind: string } })?.appError;
  return app?.kind === "session" ? "Your session ended. Sign in again to continue." :
    app?.kind === "permission" ? "This workspace is currently unavailable." :
    "We couldn’t load your company data. Check the connection and try again.";
}
export function CoreWorkspace({ view }: { view: "overview" | "customers" }) {
  const me = useCurrentUser();
  const resolved = useSessionResolved();
  const failure = useSyncExternalStore(subscribeToSession, sessionLoadFailure, () => null);
  const router = useRouter();
  const principal = me ? me.tenantId + ":" + me.id : "";
  const [workspace, setWorkspace] = useState<Load<Workspace>>({ principal: "" });
  const [directory, setDirectory] = useState<Load<Directory>>({ principal: "" });
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formPrincipal, setFormPrincipal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => { if (resolved && !me && !failure) router.replace("/sign-in"); }, [resolved, me, failure, router]);
  useEffect(() => {
    if (!principal) return;
    let current = true;
    void apiFetch<unknown>("/api/core/workspace").then(({ raw }) => {
      const data = workspaceSchema.parse(raw);
      if (data.company.id !== me!.tenantId) throw new Error("Company mismatch");
      if (current) setWorkspace({ principal, data });
    }).catch(error => { if (current) setWorkspace({ principal, error: message(error) }); });
    return () => { current = false; };
  }, [principal, refresh, me]);
  useEffect(() => {
    if (!principal || view !== "customers") return;
    let current = true;
    void apiFetch<unknown>("/api/core/customers?page=" + page).then(({ raw }) => {
      if (current) setDirectory({ principal, data: directorySchema.parse(raw) });
    }).catch(error => { if (current) setDirectory({ principal, error: message(error) }); });
    return () => { current = false; };
  }, [principal, view, page, refresh]);
  const data = workspace.principal === principal ? workspace.data : undefined;
  const companyError = workspace.principal === principal ? workspace.error : undefined;
  const customers = directory.principal === principal && directory.data?.page === page ? directory.data : undefined;
  const directoryError = directory.principal === principal ? directory.error : undefined;
  async function leave() { setLeaving(true); await signOut(); router.replace("/sign-in"); }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || saving || formPrincipal !== principal) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true); setSaveError(""); setNotice("");
    requestId.current ??= crypto.randomUUID();
    try {
      await apiFetch("/api/core/customers", { method: "POST", body: JSON.stringify({
        id: requestId.current, name: String(values.get("name") ?? "").trim(),
        customerType: values.get("customerType"), billingStateCode: values.get("billingStateCode"),
        branchId: values.get("branchId"), addressLine1: values.get("addressLine1"),
        locality: values.get("locality"), city: values.get("city"), pincode: values.get("pincode"),
      }) });
      requestId.current = null; form.reset(); setShowCreate(false);
      setNotice("Customer saved to your company directory."); setPage(0); setRefresh(n => n + 1);
    } catch { setSaveError("The customer could not be saved. Check the details or a possible existing address match. For a connection failure, retry this unchanged request safely. Contact your company owner if the refusal persists."); }
    finally { setSaving(false); }
  }
  if (!me) return <main className={styles.gate}><Building2 size={30}/><h1>Opening your workspace</h1><p role={failure ? "alert" : "status"}>{failure ? "Your account could not be verified. Please try again." : "Checking your company account…"}</p>{failure && <button className={styles.button} onClick={() => void loadCaller()}>Try again</button>}</main>;
  return <div className={styles.app}>
    <aside className={styles.sidebar} aria-label="Workspace navigation">
      <Link href="/" className={styles.brand}><span className={styles.mark}>o</span><span>oBizee<small>Service ERP</small></span></Link>
      <div className={styles.company}><Building2 size={18}/><div><strong>{data?.company.businessName ?? "Company workspace"}</strong><small>Verified company account</small></div></div>
      <p className={styles.navLabel}>WORKSPACE</p>
      <nav><Link href="/" aria-current={view === "overview" ? "page" : undefined}><LayoutDashboard size={18}/>Overview</Link><Link href="/customers" aria-current={view === "customers" ? "page" : undefined}><Users size={18}/>Customers</Link></nav>
      <p className={styles.navLabel}>MORE MODULES</p>
      <ul className={styles.upcoming}>{upcoming.map(label => <li key={label}><span>{label}</span><small>Upcoming</small></li>)}</ul>
      <div className={styles.sideFoot}><ShieldCheck size={16}/><span>Company-isolated workspace<br/>No sample activity</span></div>
    </aside>
    <div className={styles.body}>
      <header className={styles.topbar}><span>YOUR COMPANY · SERVICE ERP</span><div><Link href="/account">{me.name}</Link><button aria-label="Sign out" disabled={leaving} onClick={() => void leave()}><LogOut size={18}/></button></div></header>
      <main className={styles.main}>
        <div className={styles.heading}><div><p className={styles.eyebrow}>{data?.company.businessName ?? "Your company"}</p><h1>{view === "overview" ? "Your work, in view." : "Customers"}</h1><p>{view === "overview" ? "A live view of your company’s customers and open service work." : "Your company directory. Every record here comes from your ERP."}</p></div><button className={styles.secondary} onClick={() => { setWorkspace({ principal }); setDirectory({ principal }); setRefresh(n => n + 1); }}><RefreshCw size={16}/>Refresh</button></div>
        {me.mustChangePassword && <p className={styles.warning} role="alert">Your account requires a password change. Contact your company owner; password changes are not yet available here.</p>}
        {notice && <p className={styles.success} role="status"><Check size={16}/>{notice}</p>}
        {companyError ? <div className={styles.error} role="alert"><h2>Company data is unavailable</h2><p>{companyError}</p><button className={styles.secondary} onClick={() => setRefresh(n => n + 1)}>Try again</button></div> : !data ? <div className={styles.card} role="status">Loading your company workspace…</div> : <>
          <p className={styles.access}><ShieldCheck size={15}/>Temporary shared access · All active company users can use the available modules.<span>{ROLE_LABELS[me.role]}</span></p>
          {view === "overview" ? <>
            <section className={styles.stats} aria-label="Company totals"><div className={styles.card}><span>Customers</span><strong>{data.counts.customers.toLocaleString("en-IN")}</strong><Link href="/customers">Open directory <ArrowRight size={15}/></Link></div><div className={styles.card}><span>Open service jobs</span><strong>{data.counts.openJobs.toLocaleString("en-IN")}</strong><small>Excludes signed-off and cancelled work</small></div><div className={styles.card}><span>Company branches</span><strong>{data.branches.length}</strong><small>{data.branches.map(branch => branch.name).join(" · ") || "No branches recorded"}</small></div></section>
            <section className={styles.card}><div className={styles.sectionHeading}><div><h2>Open service work</h2><p>Next scheduled work · up to 20 open jobs</p></div><span className={styles.badge}>Live records</span></div>{data.jobs.length ? <div className={styles.tableWrap}><table><thead><tr><th>Job</th><th>Customer & service</th><th>Branch</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td className={styles.strong}>{job.number}</td><td>{job.customer}<small>{job.service}</small></td><td>{job.branch}</td><td>{job.scheduledDate ?? "Not scheduled"}</td><td><span className={styles.badge}>{job.status.replaceAll("_"," ")}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}><LayoutDashboard size={28}/><h3>No open service jobs</h3><p>There is no open work recorded for this company. Job creation and dispatch are upcoming.</p><Link href="/customers" className={styles.button}>Open customer directory <ArrowRight size={16}/></Link></div>}</section>
            <section className={styles.note}><h2>Start with your customer directory</h2><p>Add the customers your team serves. Scheduling, contracts and finance will appear as their real operational modules become available.</p><Link href="/customers">Manage customers <ArrowRight size={16}/></Link></section>
          </> : <>
            <div className={styles.directoryTools}><label className={styles.search}><Search size={17}/><input aria-label="Search current customer page" placeholder="Search this page" value={search} onChange={event => setSearch(event.target.value)}/></label><button className={styles.button} onClick={() => { setShowCreate(true); setFormPrincipal(principal); setSaveError(""); requestId.current = null; }} disabled={!data.access.modules.includes("customers")}><Plus size={17}/>Add customer</button></div>
            {showCreate && formPrincipal === principal && <section className={styles.card} aria-labelledby="create-title"><h2 id="create-title">Add a customer</h2><p className={styles.muted}>Create a customer and their primary service site together. Existing address matches are refused for review; contacts and tax details are upcoming.</p><form onSubmit={event => void create(event)} className={styles.form}><label>Customer name<input name="name" required maxLength={200} autoComplete="organization" disabled={saving}/></label><label>Operating branch<select name="branchId" required defaultValue="" disabled={saving}><option value="" disabled>Select a branch</option>{data.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Customer type<select name="customerType" disabled={saving}><option value="BUSINESS">Business</option><option value="INDIVIDUAL">Individual</option></select></label><label>Billing state or territory<select name="billingStateCode" required defaultValue="" disabled={saving}><option value="" disabled>Select a state or territory</option>{states.map(([code,label]) => <option key={code} value={code}>{label} ({code})</option>)}</select></label><label>Primary site address<input name="addressLine1" required maxLength={300} autoComplete="street-address" disabled={saving}/></label><label>Locality<input name="locality" required maxLength={120} disabled={saving}/></label><label>City<input name="city" required maxLength={120} autoComplete="address-level2" disabled={saving}/></label><label>PIN code<input name="pincode" required pattern="[1-9][0-9]{5}" maxLength={6} inputMode="numeric" autoComplete="postal-code" disabled={saving}/></label>{saveError && <p className={styles.formError} role="alert">{saveError}</p>}<div className={styles.formActions}><button className={styles.secondary} type="button" disabled={saving} onClick={() => { setShowCreate(false); requestId.current = null; }}>Cancel</button><button className={styles.button} disabled={saving}>{saving ? "Saving…" : "Save customer"}</button></div></form></section>}
            <section className={styles.card}>{directoryError ? <div className={styles.error} role="alert"><p>{directoryError}</p><button className={styles.secondary} onClick={() => setRefresh(n => n + 1)}>Try again</button></div> : !customers ? <p role="status">Loading customers…</p> : <><div className={styles.sectionHeading}><h2>Company directory</h2><span className={styles.muted}>Page {page + 1} · up to 50 records</span></div>{customers.items.length ? <div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Type</th><th>Billing state code</th></tr></thead><tbody>{customers.items.filter(customer => customer.name.toLowerCase().includes(search.toLowerCase())).map(customer => <tr key={customer.id}><td className={styles.strong}>{customer.name}</td><td>{customer.customerType === "BUSINESS" ? "Business" : "Individual"}</td><td>{customer.billingStateCode}</td></tr>)}</tbody></table>{!customers.items.some(customer => customer.name.toLowerCase().includes(search.toLowerCase())) && <p className={styles.empty}>No matches on this page. Clear the search or try another page.</p>}</div> : <div className={styles.empty}><Users size={28}/><h3>{page === 0 ? "Your customer directory is empty" : "No more customers"}</h3><p>{page === 0 ? "Add your first customer to start building your company’s records." : "Return to the previous page to see your records."}</p></div>}<div className={styles.pagination}><button className={styles.secondary} disabled={page === 0} onClick={() => { setPage(n => n - 1); setSearch(""); }}><ChevronLeft size={16}/>Previous</button><span>Page {page + 1}</span><button className={styles.secondary} disabled={!customers.hasMore} onClick={() => { setPage(n => n + 1); setSearch(""); }}>Next<ChevronRight size={16}/></button></div></>}</section>
          </>}
          <footer className={styles.footer}><span>{data.company.legalName}</span><span>Updated {new Date(data.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · <Link href="/account">Your account</Link></span></footer>
        </>}
      </main>
    </div>
  </div>;
}
