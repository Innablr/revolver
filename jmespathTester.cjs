const jmespath = require('jmespath')
const fs = require('node:fs');
const path = require('node:path')


const scriptName = path.basename(__filename)
if (process.argv.length < 4) {
  console.log("Jmespath Tester")
  console.log("Test jmespath filters against a resource json generated by Revolver.")
  console.log("See https://jmespath.org/ for information on the schema of jmespath.\n")
  console.log(`USAGE: node ${scriptName} JSONFILE JMESPATH\n`)
  console.log("\tJSONFILE - Can be generated by setting `saveResources: FILENAME.json` in your revolver config")
  console.log("\tJMESPATH - The output will be all resource IDs with whatever this path would return for each resource saved in the JSON")
  console.log("\nEXAMPLES:")
  console.log("\tGet ec2 instance type")
  console.log(`\t\tnode ${scriptName} resources.json "InstanceType"`)
  console.log("\tReturn true if zone is in ap-southeast")
  console.log(`\t\tnode ${scriptName} resources.json "Placement.AvailabilityZone | contains(@, 'ap-southeast')"`)
  console.log("\tReturn true for resources that use the default security group")
  console.log(`\t\tnode ${scriptName} resources.json "NetworkInterfaces[*].Groups[*].GroupName[] | @[?contains(@, 'default')] | @[0] != null"`)
  process.exit(1)
}
// 0 and 1 are node program and script
let jsonFile = process.argv[2]
let jmesPathVal = process.argv[3]

let data = ""
try {
  data = fs.readFileSync(jsonFile, 'utf8');
} catch (err) {
  console.error(err);
  process.exit(1)
}

const resources = JSON.parse(data)

resources.forEach((resource) => {
  console.log(resource.resourceId)
  const value = jmespath.search(resource.resource, jmesPathVal)
  console.log(JSON.stringify(value))
})
