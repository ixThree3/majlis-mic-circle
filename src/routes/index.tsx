import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock, LogIn, Mic, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authErrorToArabic, usernameToEmail, validateUsername } from "@/lib/auth-utils";
import { useOnline, useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo, UserAvatar, UserName } from "@/components/chat/user-bits";
import { useSiteSettings } from "@/lib/site-settings";
import heroImg from "@/assets/gulf-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "شات الخليج — دخول الزوار والأعضاء" },
      { name: "description", content: "ادخل شات الخليج كزائر أو عضو: غرف دردشة، مايكات صوتية مباشرة، ورسائل خاصة." },
      { property: "og:title", content: "شات الخليج — دردشة صوتية وكتابية" },
      { property: "og:description", content: "غرف دردشة عربية مع مايكات صوتية مباشرة ورسائل خاصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { users } = useOnline();
  const { profile, loading, signOut } = useSession();

  return (
    <div className="min-h-dvh bg-background">
      <section className="relative isolate overflow-hidden">
        <img src={heroImg} alt="مراكب خليجية تحت هلال الليل" width={1920} height={768} className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-night" />
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-10 pt-16 text-center sm:pt-24">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-sm text-secondary-foreground backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-success" />
            متصل الآن {users.length}
          </span>
          <h1 className="text-6xl sm:text-7xl">
            <Logo />
          </h1>
          <p className="mt-4 max-w-md text-lg text-foreground/85">سوالف، طرب، ومايكات مباشرة — حياك في مجلس الخليج</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 lg:grid-cols-[1fr_22rem]">
        <div className="mx-auto w-full max-w-md lg:order-none">
          {loading ? (
            <div className="h-80 animate-pulse rounded-2xl bg-surface" />
          ) : profile ? (
            <div className="rounded-2xl border border-border bg-gradient-panel p-6 text-center shadow-panel">
              <UserAvatar user={profile} size="lg" className="mx-auto" />
              <p className="mt-3 text-lg">
                أهلاً <UserName user={profile} />
              </p>
              <Button asChild variant="gold" size="lg" className="mt-5 w-full">
                <Link to="/rooms">ادخل الدردشة</Link>
              </Button>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => void signOut()}>
                خروج
              </Button>
            </div>
          ) : (
            <AuthCard />
          )}
          <ul className="mt-6 grid grid-cols-3 gap-3 text-center text-sm text-muted-foreground">
            <li className="rounded-xl bg-surface p-3"><Mic className="mx-auto mb-1 size-5 text-primary" />5 مايكات بكل غرفة</li>
            <li className="rounded-xl bg-surface p-3"><Users className="mx-auto mb-1 size-5 text-primary" />غرف متعددة</li>
            <li className="rounded-xl bg-surface p-3"><Lock className="mx-auto mb-1 size-5 text-primary" />رسائل خاصة</li>
          </ul>
        </div>

        <aside className="rounded-2xl border border-border bg-surface">
          <h2 className="flex items-center justify-between border-b border-border px-4 py-3 font-display text-lg">
            المتواجدين
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-sans text-xs text-secondary-foreground">{users.length}</span>
          </h2>
          <div className="max-h-[28rem] overflow-y-auto scrollbar-thin">
            {users.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">كن أول المتواجدين الليلة</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-2">
                    <UserAvatar user={u} size="sm" />
                    <div className="min-w-0">
                      <UserName user={u} className="block truncate text-sm" />
                      <p className="truncate text-xs text-muted-foreground">{u.status || "\u00a0"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function AuthCard() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const settings = useSiteSettings().data;
  const guestsOn = settings?.guests_enabled ?? true;
  const signupsOn = settings?.signups_enabled ?? true;
  const tabCount = 1 + Number(guestsOn) + Number(signupsOn);

  async function guest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    const err = validateUsername(name);
    if (err) { toast.error(err); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { username: name } } });
    setBusy(false);
    if (error) { toast.error(authErrorToArabic(error.message)); return; }
    void navigate({ to: "/rooms" });
  }

  async function member(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (validateUsername(name) || !password) { toast.error("اكتب الاسم وكلمة المرور"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: await usernameToEmail(name), password });
    setBusy(false);
    if (error) { toast.error(authErrorToArabic(error.message)); return; }
    void navigate({ to: "/rooms" });
  }

  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    const err = validateUsername(name);
    if (err) { toast.error(err); return; }
    if (password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (password !== confirm) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: await usernameToEmail(name),
      password,
      options: { data: { username: name } },
    });
    setBusy(false);
    if (error) { toast.error(authErrorToArabic(error.message)); return; }
    if (!data.session) { toast.error("تم التسجيل، لكن تعذّر الدخول تلقائياً. جرّب دخول الأعضاء."); return; }
    toast.success(`حياك الله يا ${name}!`);
    void navigate({ to: "/rooms" });
  }

  return (
    <div className="rounded-2xl border border-border bg-gradient-panel p-5 shadow-panel">
      <Tabs key={`${guestsOn}-${signupsOn}`} defaultValue={guestsOn ? "guest" : "member"} dir="rtl">
        <TabsList className={`grid h-auto w-full bg-background/60 p-1 ${tabCount === 3 ? "grid-cols-3" : tabCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {guestsOn && <TabsTrigger value="guest" className="py-2">دخول الزوار</TabsTrigger>}
          <TabsTrigger value="member" className="py-2">دخول الأعضاء</TabsTrigger>
          {signupsOn && <TabsTrigger value="register" className="py-2">تسجيل عضوية</TabsTrigger>}
        </TabsList>

        <TabsContent value="guest" className="mt-5">
          <form onSubmit={guest} className="space-y-4">
            <Field id="g-name" name="name" label="اسمك المستعار" placeholder="مثلاً: نجم الليل" />
            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
              <LogIn /> دخول
            </Button>
            <p className="text-center text-xs text-muted-foreground">الزوار ما يقدرون يحجزون الاسم — سجّل عضوية عشان يكون لك</p>
          </form>
        </TabsContent>

        <TabsContent value="member" className="mt-5">
          <form onSubmit={member} className="space-y-4">
            <Field id="m-name" name="name" label="اسم العضوية" />
            <Field id="m-pass" name="password" label="كلمة المرور" type="password" autoComplete="current-password" />
            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
              <LogIn /> دخول
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="register" className="mt-5">
          <form onSubmit={register} className="space-y-4">
            <Field id="r-name" name="name" label="اسم العضوية" placeholder="من 2 إلى 20 حرف" />
            <Field id="r-pass" name="password" label="كلمة المرور" type="password" autoComplete="new-password" />
            <Field id="r-confirm" name="confirm" label="تأكيد كلمة المرور" type="password" autoComplete="new-password" />
            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
              <UserPlus /> تسجيل
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required maxLength={props.type === "password" ? 72 : 20} className="h-11 bg-background/70" {...props} />
    </div>
  );
}
