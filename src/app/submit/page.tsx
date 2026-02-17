import { redirect } from "next/navigation";

export default function SubmitPage() {
  redirect("/?post_pitch=1");
}
