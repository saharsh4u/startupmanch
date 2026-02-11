import { supabaseAdmin } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  email: string;
  role: "founder" | "investor" | "admin";
};

const getBearerToken = (request: Request) => {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer") return null;
  return token ?? null;
};

const adminEmail = "saharashsharma3@gmail.com";
const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

export const getAuthContext = async (request: Request): Promise<AuthContext | null> => {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const normalizedEmail = normalizeEmail(data.user.email);
  const displayName =
    typeof data.user.user_metadata?.full_name === "string"
      ? data.user.user_metadata.full_name
      : typeof data.user.user_metadata?.name === "string"
        ? data.user.user_metadata.name
        : null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, email")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    const role = normalizedEmail === adminEmail ? "admin" : "founder";
    const { data: created, error: createError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: data.user.id,
          email: normalizedEmail || null,
          role,
          display_name: displayName,
        },
        { onConflict: "id" }
      )
      .select("id, role, email")
      .single();

    if (createError || !created) {
      return null;
    }

    return {
      userId: created.id,
      email: created.email ?? normalizedEmail,
      role: created.role,
    };
  }

  const normalizedProfileEmail = normalizeEmail(profile.email);
  if (normalizedProfileEmail !== normalizedEmail) {
    await supabaseAdmin
      .from("profiles")
      .update({
        email: normalizedEmail || null,
        display_name: displayName,
      })
      .eq("id", profile.id);
  }

  return {
    userId: profile.id,
    email: normalizedProfileEmail || normalizedEmail,
    role: profile.role,
  };
};

export const requireRole = (
  context: AuthContext | null,
  roles: Array<AuthContext["role"]>
) => {
  if (!context) return false;
  return roles.includes(context.role);
};
