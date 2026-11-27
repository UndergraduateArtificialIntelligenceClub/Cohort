import { useId, type ReactNode } from "react";
import { IconAlert, IconInfo, Logo } from "./Icons";
import { APP_NAME } from "../lib/config";

type Props = {
  title: string;
  description: ReactNode;
  children: ReactNode;
};

function AuthCard({ title, description, children }: Props) {
  const id = useId();
  return (
    <div className="min-h-svh bg-bg">
      <main className="mx-auto flex min-h-svh max-w-[380px] flex-col justify-center gap-6 px-4 py-8">
        <div className="inline-flex items-center gap-2 font-semibold">
          <Logo />
          <span>{APP_NAME}</span>
        </div>
        <section aria-labelledby={`${id}-heading`} className="panel flex flex-col gap-4 p-6">
          <div>
            <h1 id={`${id}-heading`} className="font-semibold">
              {title}
            </h1>
            <p className="muted mt-1">{description}</p>
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}

export type Message = { text: string; kind: "error" | "info" };

export function AuthMessage({ message }: { message: Message }) {
  return (
    <p role="status" className={`notice ${message.kind === "error" ? "notice-error" : "notice-info"}`}>
      {message.kind === "error" ? <IconAlert /> : <IconInfo />}
      <span>{message.text}</span>
    </p>
  );
}

export default AuthCard;
