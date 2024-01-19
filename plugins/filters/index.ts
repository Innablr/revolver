function filterResource(resource: any, filter: string): boolean {
  return resource.resourceId === filter;
}

export default filterResource;
