/** "Nothing here" in a list cell: a dash to see, a word to hear. */
export function NoneMark() {
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">None</span>
    </>
  );
}
