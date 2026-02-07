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

export const getAuthContext = async (request: Request): Promise<AuthContext | null> => {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, email")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    const email = data.user.email ?? "";
    const role = email.toLowerCase() === adminEmail ? "admin" : "founder";
    const { data: created, error: createError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: data.user.id,
          email,
          role,
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
      email: created.email ?? email,
      role: created.role,
    };
  }

  return {
    userId: profile.id,
    email: profile.email ?? data.user.email ?? "",
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
