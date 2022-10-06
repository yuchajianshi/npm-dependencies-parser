const fs = require('fs');
const readline = require('readline');

const lockContent = [];
let packageArr = [];
let packageMap = {};

function parse(fileName = 'yarn.lock') {
  const fRead = fs.createReadStream(fileName);
  const objReadLine = readline.createInterface({ input: fRead });
  objReadLine.on('line', function(line) {
    if (line) {
      lockContent.push(line);
    }
  })
  objReadLine.on('close', () => {
    packageArr = parseYarnLock();
    for (let i = 0; i < packageArr.length; i++) {
      for (let j = 0; j < packageArr[i].versionConstraint.length; j++) {
        let ident = `${packageArr[i].name}@${packageArr[i].versionConstraint[j]}`;
        packageMap[ident] = packageArr[i];
      }
    }
    console.log(`package count: ${packageArr.length}`);
    console.log(`package with different version count: ${Object.keys(packageMap).length}`);
    fillParentDependency(packageArr);
    analyse(packageArr);
    analyseTopPackages(packageArr);
  });
}

function parseYarnLock() {
  const packageArr = [];
  let packageInfo = null;
  let layerName = '';
  for (let i = 0; i < lockContent.length; i++) {
    const line = lockContent[i];
    if (line[0] === '#') {
      continue;
    }
    if (line[0] !== ' ') { // 包标识符开始的标志
      if (packageInfo) {
        packageArr.push(packageInfo);
      }
      packageInfo = {};
      const identStr = line.slice(0, -1); // 去掉包标识符末尾的冒号
      const identifiers = identStr.split(',').map(item => item.trim());
      const nameAndVersionInfoArr = [];
      for (let j = 0; j < identifiers.length; j++) {
        nameAndVersionInfoArr.push(parseIdentifier(identifiers[j]));
      }
      packageInfo.name = nameAndVersionInfoArr[0].name;
      packageInfo.versionConstraint = nameAndVersionInfoArr.map(item => item.version);
    } else if (isFirstLayer(line)) {
      const lineContent = line.trim();
      if (lineContent.startsWith('dependencies')) {
        layerName = 'dependencies';
        packageInfo.dependencies = [];
      } else if (lineContent.startsWith('optionalDependencies')) {
        layerName = 'optionalDependencies';
        packageInfo.optionalDependencies = [];
      } else {
        parsePackageAttr(packageInfo, lineContent);
      }
    } else if (isSecondLayer(line)) {
      const lineContent = line.trim();
      packageInfo[layerName].push(parseDependency(lineContent));
    } else {
      console.log('unkonw line: ', line);
    }
  }
  if (packageInfo) {
    packageArr.push(packageInfo);
  }
  return packageArr;
}

function parseIdentifier(identifier) {
  let ident = identifier;
  if (identifier[0] === '"') {
    ident = identifier.slice(1, -1);
  }
  let flagIndex = -1;
  for (let i = 0; i < ident.length; i++) {
    if (ident[i] === '@' && i !== 0) {
      flagIndex = i;
      break;
    }
  }
  return {
    name: ident.slice(0, flagIndex),
    version: ident.slice(flagIndex + 1),
  }
}

function parsePackageAttr(infoObj, str) {
  const parts = str.split(' ');
  infoObj[parts[0]] = parts[1][0] === '"' ? parts[1].slice(1, -1) : parts[1];
  return infoObj;
}

function parseDependency(str) {
  const index = str.indexOf(' ');
  let name = str.slice(0, index);
  let version = str.slice(index + 2, -1);
  if (name[0] === '"') {
    name = name.slice(1, -1);
  }
  return {
    name,
    version,
  }
}

function isFirstLayer(str) {
  return str[0] === ' ' && str[1] === ' ' && str[2] !== ' ';
}

function isSecondLayer(str) {
  return str[0] === ' ' && str[1] === ' ' && str[2] === ' ' && str[3] === ' ';
}

function analyse(packageArr) {
  let mapNamePackage = {};
  for (let i = 0; i < packageArr.length; i++) {
    if (mapNamePackage[packageArr[i].name]) {
      mapNamePackage[packageArr[i].name].push(packageArr[i]);
    } else {
      mapNamePackage[packageArr[i].name] = [packageArr[i]];
    }
  }

  let multiCount = 0;
  let mapCountPackage = {};
  const keys = Object.keys(mapNamePackage);
  for (let i = 0; i < keys.length; i++) {
    let count = mapNamePackage[keys[i]].length;
    if (count > 1) multiCount++;
    if (mapCountPackage[count]) {
      mapCountPackage[count].push(mapNamePackage[keys[i]]);
    } else {
      mapCountPackage[count] = [mapNamePackage[keys[i]]];
    }
  }

  console.log(`multi package count: ${multiCount}`);
  const countKeys = Object.keys(mapCountPackage);
  for (let i = 0; i < countKeys.length; i++) {
    if (countKeys[i] > 1) {
      console.log(`package num with ${countKeys[i]}: ${mapCountPackage[countKeys[i]].length}`);
    }
    if (countKeys[i] > 2) {
      const packagesWidthCount = mapCountPackage[countKeys[i]];
      for (let j = 0; j < packagesWidthCount.length; j++) {
        analysePackages(packagesWidthCount[j]);
      }
    }
  }
  console.log('');
}

function fillParentDependency(packageArr) {
  for (let i = 0; i < packageArr.length; i++) {
    if (packageArr[i].dependencies && packageArr[i].dependencies.length > 0) {
      for (let j = 0; j < packageArr[i].dependencies.length; j++) {
        const dependency = packageArr[i].dependencies[j];
        const ident = `${dependency.name}@${dependency.version}`;
        if (!packageMap[ident]) {
          console.warn(`ident ${ident} has no package`);
          continue;
        }
        packageMap[ident].parentDependencies = packageMap[ident].parentDependencies || [];
        packageMap[ident].parentDependencies.push(packageArr[i]);
      }
    }
    if (packageArr[i].optionalDependencies && packageArr[i].optionalDependencies.length > 0) {
      for (let j = 0; j < packageArr[i].optionalDependencies.length; j++) {
        const dependency = packageArr[i].optionalDependencies[j];
        const ident = `${dependency.name}@${dependency.version}`;
        if (!packageMap[ident]) {
          console.warn(`ident ${ident} has no package`);
          continue;
        }
        packageMap[ident].parentDependencies = packageMap[ident].parentDependencies || [];
        packageMap[ident].parentDependencies.push(packageArr[i]);
      }
    }
  }
}

function analysePackages(packageArr) {
  let packageName = packageArr[0].name;
  let reasonPackages = [];
  for (let i = 0; i < packageArr.length; i++) {
    if (packageArr[i].name !== packageName) {
      console.warn(`${packageName} error`);
      break;
    }
    const topPackages = getTopPackages(packageArr[i]);
    reasonPackages.push(topPackages);
  }
}

function analyseTopPackages(packageArr) {
  let topPackages = [];
  for (let i = 0; i < packageArr.length; i++) {
    if (!packageArr[i].parentDependencies || packageArr[i].parentDependencies.length === 0) {
      topPackages.push(packageArr[i]);
    }
  }
  console.log(`top package count: ${topPackages.length}`);
  let multiPackageCount = 0;
  let output = '';
  for (let i = 0; i < topPackages.length; i++) {
    const packagesWithSameName = getSameNamePackage(topPackages[i].name);
    if (packagesWithSameName.length > 1) {
      output += `Project package ${topPackages[i].name}@${topPackages[i].version} exist simultaneously with dependency\r\n`;
      multiPackageCount++;
      for (let j = 0; j < packagesWithSameName.length; j++) {
        if (packagesWithSameName[j].name === topPackages[i].name && packagesWithSameName[j].version === topPackages[i].version) continue;
        let topReasonPackages = getTopPackages(packagesWithSameName[j]);
        let names = topReasonPackages.map(p => p.name).join(',');
        output += `${packagesWithSameName[j].name}@${packagesWithSameName[j].version}(indirectly referenced by ${names})\r\n\r\n`;
      }
    }
  }
  console.log(`The following ${multiPackageCount} packages has multi dependency`);
  console.log(output);
}

function getSameNamePackage(name) {
  let packages = [];
  for (let i = 0; i < packageArr.length; i++) {
    if (packageArr[i].name === name) {
      packages.push(packageArr[i]);
    }
  }
  return packages;
}

// 有循环依赖的情况，如yeoman-environment和yeoman-generator
function getTopPackages(package) {
  // 没有父依赖的包顶层依赖为自己
  if (!package.parentDependencies || package.parentDependencies.length === 0) return package;
  let topPackages = new Set();
  let parentPackages = [...package.parentDependencies] || [];
  const cache = new Map();
  while (parentPackages.length > 0) {
    // 防止循环依赖
    let package = parentPackages.shift();
    if (cache.has(package)) continue;
    cache.set(package, true);
    if (package.parentDependencies && package.parentDependencies.length > 0) { // 有父依赖，那就继续往上找
      parentPackages.push(...package.parentDependencies);
    } else {
      topPackages.add(package);
    }
  }
  return [...topPackages];
}

module.exports = parse;