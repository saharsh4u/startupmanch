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

  if (profileError || !profile) return null;

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
