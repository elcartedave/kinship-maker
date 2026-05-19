"use client";

import { useActionState } from "react";

import {
  saveProfile,
  type ProfileFormState,
} from "@/app/profile/setup/actions";
import type { ProfileSetupInitialValues } from "@/lib/profile";

type ProfileFormProps = {
  initialValues: ProfileSetupInitialValues;
  nextPath: string;
  submitLabel?: string;
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return <p className="mt-2 text-sm text-[rgb(153,53,36)]">{messages[0]}</p>;
}

export function ProfileForm({
  initialValues,
  nextPath,
  submitLabel = "Continue",
}: ProfileFormProps) {
  const initialState: ProfileFormState = {
    values: initialValues,
  };
  const [state, action, pending] = useActionState(saveProfile, initialState);
  const values = state.values ?? initialValues;

  return (
    <form action={action} className="mt-8 grid gap-5">
      <input type="hidden" name="next" value={nextPath} />

      {state.errors?.form?.length ? (
        <p className="rounded-[1.25rem] border border-[rgba(153,53,36,0.22)] bg-white/75 px-4 py-3 text-sm leading-6 text-[rgb(153,53,36)]">
          {state.errors.form[0]}
        </p>
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
        className="mt-2 inline-flex w-fit rounded-full bg-accent px-5 py-3 font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
