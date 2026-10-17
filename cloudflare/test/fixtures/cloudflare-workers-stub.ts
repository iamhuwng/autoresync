export class DurableObject {
  constructor(
    protected readonly state?: unknown,
    protected readonly env?: unknown,
  ) {}
}
