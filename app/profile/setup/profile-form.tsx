"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  saveProfile,
  type ProfileFormState,
} from "@/app/profile/setup/actions";
import type { ProfileSetupInitialValues } from "@/lib/profile";

type ProfileFormProps = {
  initialValues: ProfileSetupInitialValues;
  nextPath: string;
  submitLabel?: string;
  email?: string;
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return <p className="mt-2 text-sm text-[rgb(153,53,36)]">{messages[0]}</p>;
}

function getToastMessage(state: ProfileFormState) {
  const formMessage = state.errors?.form?.[0];
  if (formMessage) {
    return formMessage;
  }

  const fieldMessages = [
    state.errors?.firstName?.[0],
    state.errors?.middleName?.[0],
    state.errors?.lastName?.[0],
    state.errors?.nickname?.[0],
    state.errors?.age?.[0],
    state.errors?.sexAssignedAtBirth?.[0],
  ].filter(Boolean);

  if (fieldMessages.length > 0) {
    return fieldMessages[0] as string;
  }

  return null;
}

export function ProfileForm({
  initialValues,
  nextPath,
  submitLabel = "Continue",
  email,
}: ProfileFormProps) {
  const initialState: ProfileFormState = {
    values: initialValues,
  };
  const [state, action, pending] = useActionState(saveProfile, initialState);
  const values = state.values ?? initialValues;
  const toastMessage = getToastMessage(state);
  const lastToastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (pending || !toastMessage) {
      return;
    }

    if (lastToastMessageRef.current === toastMessage) {
      return;
    }

    lastToastMessageRef.current = toastMessage;

    toast(toastMessage);
  }, [pending, toastMessage]);

  return (
    <form action={action} className="mt-8 grid gap-5">
      <input type="hidden" name="next" value={nextPath} />

      {email ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Email address
          </span>
          <input
            type="email"
            value={email}
            disabled
            className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-ink-soft outline-none opacity-80 cursor-not-allowed"
          />
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            First name
          </span>
          <input
            name="firstName"
            autoComplete="given-name"
            defaultValue={values.firstName}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
          <FieldError messages={state.errors?.firstName} />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Middle name
          </span>
          <input
            name="middleName"
            autoComplete="additional-name"
            defaultValue={values.middleName}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
          />
          <FieldError messages={state.errors?.middleName} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Last name
          </span>
          <input
            name="lastName"
            autoComplete="family-name"
            defaultValue={values.lastName}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
          <FieldError messages={state.errors?.lastName} />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Nickname
          </span>
          <input
            name="nickname"
            autoComplete="nickname"
            defaultValue={values.nickname}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
          <FieldError messages={state.errors?.nickname} />
        </label>
      </div>

      <label className="block max-w-40">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Age
        </span>
        <input
          name="age"
          type="number"
          inputMode="numeric"
          min="1"
          max="130"
          defaultValue={values.age}
          className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
          required
        />
        <FieldError messages={state.errors?.age} />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Sex assigned at birth
        </span>
        <select
          name="sexAssignedAtBirth"
          defaultValue={values.sexAssignedAtBirth}
          className="mt-2 w-full max-w-64 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
          required
        >
          <option value="" disabled>
            Select one
          </option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
        <FieldError messages={state.errors?.sexAssignedAtBirth} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex w-fit rounded-full border border-ink bg-ink px-5 py-3 font-semibold text-cream shadow-[0_6px_18px_rgba(15,14,13,0.08)] transition hover:bg-cream hover:text-ink disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
