import { ConvertLeadForm } from "./convert-lead-form";

export default async function ConvertLeadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value !== "" ? value : null;
  };

  return (
    <ConvertLeadForm
      leadId={one("leadId")}
      reference={one("fromLead")}
      customer={one("customer")}
      site={one("site")}
      value={one("value")}
    />
  );
}
