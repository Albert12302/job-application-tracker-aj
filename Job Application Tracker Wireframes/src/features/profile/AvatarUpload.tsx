import { CameraIcon, Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { AVATAR_TYPES } from '@/domain/avatar';
import { errorReference } from '@/queries/errors';
import { AvatarRejectedError, useRemoveAvatar, useSetAvatar } from '@/queries/use-mutations';
import { useAvatarImage } from '@/queries/use-profile';

/**
 * The avatar is the upload control (SPEC §4.6): a real file input, visually
 * hidden, labelled by the avatar — so it is keyboard-reachable and has a name
 * (§10.2), and the focus ring is drawn on the avatar it stands for.
 */
export function AvatarUpload({ name, path }: { name: string; path: string | null }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const image = useAvatarImage(path);
  const setAvatar = useSetAvatar();
  const removeAvatar = useRemoveAvatar();
  // Kept for "Retry" (§8.2 upload: "Upload failed." + Retry).
  const [lastFile, setLastFile] = useState<File | null>(null);
  const busy = setAvatar.isPending || removeAvatar.isPending;

  function upload(file: File) {
    setLastFile(file);
    removeAvatar.reset();
    setAvatar.mutate({ file, previousPath: path }, { onSuccess: () => toast.success('Photo updated.') });
  }

  function remove(current: string) {
    setAvatar.reset();
    removeAvatar.mutate(current, { onSuccess: () => toast.success('Photo removed.') });
  }

  const rejected = setAvatar.error instanceof AvatarRejectedError ? setAvatar.error : null;
  const uploadMessage = rejected ? rejected.userMessage : setAvatar.error ? 'Upload failed.' : null;
  const reference = errorReference(setAvatar.error) ?? errorReference(removeAvatar.error);

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        id={inputId}
        type="file"
        // A hint for the picker only; the bytes are checked before upload (§7.3).
        accept={AVATAR_TYPES.join(',')}
        className="peer sr-only"
        disabled={busy}
        aria-describedby={uploadMessage ? errorId : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // picking the same file again must fire change
          if (file) upload(file);
        }}
      />
      <label
        htmlFor={inputId}
        className="relative block cursor-pointer rounded-full outline-offset-4 peer-disabled:cursor-wait peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid"
      >
        <span className="sr-only">{path ? 'Change photo' : 'Upload a photo'}</span>
        <UserAvatar name={name} src={image.data} size="lg" />
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border bg-card text-link shadow-sm"
        >
          <CameraIcon className="size-3.5" />
        </span>
        {setAvatar.isPending ? (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-full bg-card/70">
            <Loader2Icon className="size-5 animate-spin text-link" />
          </span>
        ) : null}
      </label>

      <p role="status" className="sr-only">
        {setAvatar.isPending ? 'Uploading photo…' : removeAvatar.isPending ? 'Removing photo…' : ''}
      </p>

      {uploadMessage ? (
        <div id={errorId} role="alert" className="flex flex-col items-center text-sm text-destructive">
          <p>{uploadMessage}</p>
          {reference ? <p className="text-muted-foreground">Error reference <span className="font-mono">{reference}</span></p> : null}
          {!rejected && lastFile ? (
            <Button variant="link" className="h-auto p-0 text-link max-[760px]:min-h-11" onClick={() => upload(lastFile)}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {removeAvatar.isError && path ? (
        <div role="alert" className="flex flex-col items-center text-sm text-destructive">
          <p>Couldn't remove the photo.</p>
          {reference ? <p className="text-muted-foreground">Error reference <span className="font-mono">{reference}</span></p> : null}
          <Button variant="link" className="h-auto p-0 text-link max-[760px]:min-h-11" onClick={() => remove(path)}>
            Retry
          </Button>
        </div>
      ) : null}

      {path ? (
        <Button
          variant="link"
          size="sm"
          className="text-link max-[760px]:h-11"
          disabled={busy}
          onClick={() => remove(path)}
        >
          Remove photo
        </Button>
      ) : null}
    </div>
  );
}
