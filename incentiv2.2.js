import blessed from "blessed";
import chalk from "chalk";
import figlet from "figlet";
import { ethers } from "ethers";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const RPC_URL = "https://rpc1.testnet.incentiv.io";
const BUNDLER_URL = "https://bundler-testnet.incentiv.io";
const CHAIN_ID = 28802;
const ENTRY_POINT = ethers.utils.getAddress("0x9b5d240EF1bc8B4930346599cDDFfBD7d7D56db9");
const ROUTER = ethers.utils.getAddress("0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0");
const WETH = ethers.utils.getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");
const SMPL = ethers.utils.getAddress("0x0165878A594ca255338adfa4d48449f69242Eb8F");
const BULL = ethers.utils.getAddress("0x8A791620dd6260079BF849Dc5567aDC3F2FdC318");
const FLIP = ethers.utils.getAddress("0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0");
const ZERO_ADDRESS = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
const CONFIG_FILE = "config.json";
const TOKEN_FILE = "token.json";
const TWO_CAPTCHA_FILE = "api.json";
const TURNSTILE_SITEKEY = "0x4AAAAAABl4Ht6hzgSZ-Na3";
const PAGE_URL = "https://testnet.incentiv.io/";
const isDebug = false;

let walletInfo = {
  address: "N/A",
  balanceTCENT: "0.0000",
  balanceSMPL: "0.0000",
  balanceBULL: "0.0000",
  balanceFLIP: "0.0000",
  activeAccount: "N/A"
};
let transactionLogs = [];
let activityRunning = false;
let isCycleRunning = false;
let shouldStop = false;
let dailyActivityInterval = null;
let accounts = [];
let proxies = [];
let recipients = []; 
let selectedWalletIndex = 0;
let loadingSpinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const borderBlinkColors = ["cyan", "blue", "magenta", "red", "yellow", "green"];
let borderBlinkIndex = 0;
let blinkCounter = 0;
let spinnerIndex = 0;
let hasLoggedSleepInterrupt = false;
let isHeaderRendered = false;
let activeProcesses = 0;
let isFaucetRunning = false; 
let shouldStopFaucet = false;
let isStoppingFaucet = false;

let dailyActivityConfig = {
  bundleRepetitions: 1,
  addContactRepetitions: 1,
  swapRepetitions: 1,
  tcentSwapRange: { min: 0.1, max: 0.5 },
  smplSwapRange: { min: 0.15, max: 0.7 },
  bullSwapRange: { min: 1, max: 2 },
  flipSwapRange: { min: 1, max: 2 },
  loopHours: 24,
  transferRepetitions: 1,
  tcentTransferRange: { min: 0.01, max: 0.04 }
};

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
];

const API_HEADERS = {
  'accept': '*/*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'connection': 'keep-alive',
  'origin': 'https://testnet.incentiv.io',
  'referer': 'https://testnet.incentiv.io/',

};

const RPC_HEADERS = {
  'content-type': 'application/json',
  'origin': 'https://testnet.incentiv.io',
  'referer': 'https://testnet.incentiv.io/',
  'user-agent': userAgents[0]
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf8");
      const config = JSON.parse(data);
      dailyActivityConfig.bundleRepetitions = Number(config.bundleRepetitions) || 1;
      dailyActivityConfig.addContactRepetitions = Number(config.addContactRepetitions) || 1;
      dailyActivityConfig.swapRepetitions = Number(config.swapRepetitions) || 1;
      dailyActivityConfig.tcentSwapRange.min = Number(config.tcentSwapRange?.min) || 0.1;
      dailyActivityConfig.tcentSwapRange.max = Number(config.tcentSwapRange?.max) || 0.5;
      dailyActivityConfig.smplSwapRange.min = Number(config.smplSwapRange?.min) || 0.15;
      dailyActivityConfig.smplSwapRange.max = Number(config.smplSwapRange?.max) || 0.7;
      dailyActivityConfig.bullSwapRange.min = Number(config.bullSwapRange?.min) || 1;
      dailyActivityConfig.bullSwapRange.max = Number(config.bullSwapRange?.max) || 2;
      dailyActivityConfig.flipSwapRange.min = Number(config.flipSwapRange?.min) || 1;
      dailyActivityConfig.flipSwapRange.max = Number(config.flipSwapRange?.max) || 2;
      dailyActivityConfig.loopHours = Number(config.loopHours) || 24;
      dailyActivityConfig.transferRepetitions = Number(config.transferRepetitions) || 1;
      dailyActivityConfig.tcentTransferRange.min = Number(config.tcentTransferRange?.min) || 0.01;
      dailyActivityConfig.tcentTransferRange.max = Number(config.tcentTransferRange?.max) || 0.04;
    } else {
      addLog("No config file found, using default settings.", "info");
    }
  } catch (error) {
    addLog(`Failed to load config: ${error.message}`, "error");
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dailyActivityConfig, null, 2));
    addLog("Configuration saved successfully.", "success");
  } catch (error) {
    addLog(`Failed to save config: ${error.message}`, "error");
  }
}

async function saveToken(eoaAddress, smartAddress, token) {
  try {
    let tokens = {};
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, "utf8");
      tokens = JSON.parse(data);
    }
    tokens[eoaAddress.toLowerCase()] = { smartAddress, token };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    addLog(`Token Saved For Wallet: ${getShortAddress(eoaAddress)}`, "success");
  } catch (error) {
    addLog(`Failed to save token: ${error.message}`, "error");
  }
}

async function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, "utf8");
      const tokens = JSON.parse(data);
      accounts.forEach(account => {
        const wallet = new ethers.Wallet(account.privateKey);
        const eoaAddress = wallet.address;
        if (tokens[eoaAddress.toLowerCase()]) {
          account.smartAddress = ethers.utils.getAddress(tokens[eoaAddress.toLowerCase()].smartAddress);
          account.token = tokens[eoaAddress.toLowerCase()].token;
          addLog(`Loaded Token for account: ${getShortAddress(eoaAddress)}`, "info");
        }
      });
    } else {
      addLog("No token file found.", "info");
    }
  } catch (error) {
    addLog(`Failed to load tokens: ${error.message}`, "error");
  }
}

function hexlifyBigInts(obj) {
  if (typeof obj === 'bigint') {
    return ethers.utils.hexlify(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(hexlifyBigInts);
  }
  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, hexlifyBigInts(value)])
    );
  }
  return obj;
}

async function makeApiCall(url, method, data, proxyUrl, token = null) {
  try {
    let headers = {
      ...API_HEADERS,
      'user-agent': userAgents[Math.floor(Math.random() * userAgents.length)]
    };
    if (method === 'POST' && data) {
      headers['content-type'] = 'application/json';
    }
    if (token) {
      headers['token'] = token;
    }
    const agent = createAgent(proxyUrl);
    if (isDebug) {
      addLog(`Debug: Sending API request to ${url} with payload: ${JSON.stringify(data, null, 2)}`, "debug");
    }
    const response = await axios({ method, url, data, headers, httpsAgent: agent });
    if (isDebug) {
      addLog(`Debug: API response from ${url}: ${JSON.stringify(response.data, null, 2)}`, "debug");
    }
    return response.data;
  } catch (error) {
    addLog(`API call failed (${url}): ${error.message}`, "error");
    if (error.response) {
      addLog(`Debug: Error response: ${JSON.stringify(error.response.data, null, 2)}`, "debug");
    }
    throw error;
  }
}

async function testToken(account, proxyUrl) {
  try {
    await makeApiCall('https://api.testnet.incentiv.io/api/user', 'GET', null, proxyUrl, account.token);
    return true;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      addLog(`Token invalid/expired for account: ${getShortAddress(account.smartAddress)}`, "warn");
      return false;
    }
    throw error;
  }
}

async function getIP(proxyUrl) {
  try {
    const agent = createAgent(proxyUrl);
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      headers: { 'User-Agent': userAgents[0] },
      timeout: 5000
    });
    return response.data.ip;
  } catch (error) {
    addLog(`Failed to fetch IP: ${error.message}`, "warn");
    return "Unknown";
  }
}

async function makeBundlerCall(method, params, proxyUrl) {
  try {
    const payload = {
      jsonrpc: "2.0",
      method,
      params: hexlifyBigInts(params),
      id: Math.floor(Math.random() * 1000)
    };
    const agent = createAgent(proxyUrl);
    addLog(`Bundler payload: ${JSON.stringify(payload, null, 2)}`, "debug");
    const response = await axios.post(BUNDLER_URL, payload, { httpsAgent: agent, headers: RPC_HEADERS });
    if (response.data.error) {
      const errMsg = response.data.error.message || JSON.stringify(response.data.error);
      addLog(`Bundler error: ${errMsg}`, "error");
      throw new Error(errMsg);
    }
    addLog(`Bundler response: ${JSON.stringify(response.data, null, 2)}`, "debug");
    return response.data;
  } catch (error) {
    addLog(`Bundler call failed: ${error.message}`, "error");
    throw error;
  }
}

process.on("unhandledRejection", (reason) => {
  addLog(`Unhandled Rejection: ${reason.message || reason}`, "error");
});

process.on("uncaughtException", (error) => {
  addLog(`Uncaught Exception: ${error.message}\n${error.stack}`, "error");
  process.exit(1);
});

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function addLog(message, type = "info") {
  if (type === "debug" && !isDebug) return;
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  let coloredMessage;
  switch (type) {
    case "error":
      coloredMessage = chalk.redBright(message);
      break;
    case "success":
      coloredMessage = chalk.greenBright(message);
      break;
    case "warn":
      coloredMessage = chalk.magentaBright(message);
      break;
    case "wait":
      coloredMessage = chalk.yellowBright(message);
      break;
    case "info":
      coloredMessage = chalk.whiteBright(message);
      break;
    case "delay":
      coloredMessage = chalk.cyanBright(message);
      break;
    case "debug":
      coloredMessage = chalk.blueBright(message);
      break;
    default:
      coloredMessage = chalk.white(message);
  }
  const logMessage = `[${timestamp}] ${coloredMessage}`;
  transactionLogs.push(logMessage);
  if (transactionLogs.length > 50) {
    transactionLogs.shift();
  }
  updateLogs();
}

function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

function clearTransactionLogs() {
  transactionLogs = [];
  logBox.setContent('');
  logBox.scrollTo(0);
  addLog("Transaction logs cleared.", "success");
}

function loadAccounts() {
  try {
    const data = fs.readFileSync("pk.txt", "utf8");
    accounts = data.split("\n").map(line => line.trim()).filter(line => line).map(privateKey => ({ privateKey, smartAddress: null, token: null, nextFaucetTime: 0, isClaiming: false }));
    if (accounts.length === 0) {
      throw new Error("No private keys found in pk.txt");
    }
    addLog(`Loaded ${accounts.length} accounts from pk.txt`, "success");
    loadTokens();
  } catch (error) {
    addLog(`Failed to load accounts: ${error.message}`, "error");
    accounts = [];
  }
}

function loadProxies() {
  try {
    if (fs.existsSync("proxy.txt")) {
      const data = fs.readFileSync("proxy.txt", "utf8");
      proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
      if (proxies.length === 0) throw new Error("No proxy found in proxy.txt");
      addLog(`Loaded ${proxies.length} proxies from proxy.txt`, "success");
    } else {
      addLog("No proxy.txt found, running without proxy.", "info");
    }
  } catch (error) {
    addLog(`Failed to load proxy: ${error.message}`, "info");
    proxies = [];
  }
}

function loadRecipients() {
  try {
    if (fs.existsSync("wallet.txt")) {
      const data = fs.readFileSync("wallet.txt", "utf8");
      recipients = data.split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.startsWith("0x")) 
        .map(addr => {
          try {
            return ethers.utils.getAddress(addr);
          } catch (err) {
            addLog(`Invalid address in wallet.txt: ${addr} - ${err.message}`, "warn");
            return null;
          }
        })
        .filter(addr => addr !== null); 
      if (recipients.length === 0) throw new Error("No valid recipient addresses found in wallet.txt");
      addLog(`Loaded ${recipients.length} recipient addresses from wallet.txt`, "success");
    } else {
      addLog("No wallet.txt found, cannot perform transfers.", "error");
    }
  } catch (error) {
    addLog(`Failed to load recipients: ${error.message}`, "error");
    recipients = [];
  }
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}

function getProvider(rpcUrl, chainId, proxyUrl, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const agent = createAgent(proxyUrl);
      const options = { pollingInterval: 500 };
      if (agent) {
        options.fetchOptions = { agent };
      }
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, { chainId, name: "Incentiv Testnet" }, options);
      return provider;
    } catch (error) {
      addLog(`Attempt ${attempt}/${maxRetries} failed to initialize provider: ${error.message}`, "error");
      if (attempt < maxRetries) sleep(1000);
    }
  }
  throw new Error(`Failed to initialize provider for chain ${chainId}`);
}

async function sleep(ms) {
  if (shouldStop) {
    if (!hasLoggedSleepInterrupt) {
      addLog("Process stopped successfully.", "info");
      hasLoggedSleepInterrupt = true;
    }
    return;
  }
  activeProcesses++;
  try {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);
      const checkStop = setInterval(() => {
        if (shouldStop) {
          clearTimeout(timeout);
          clearInterval(checkStop);
          if (!hasLoggedSleepInterrupt) {
            addLog("Process interrupted.", "info");
            hasLoggedSleepInterrupt = true;
          }
          resolve();
        }
      }, 100);
    });
  } catch (error) {
    addLog(`Sleep error: ${error.message}`, "error");
  } finally {
    activeProcesses = Math.max(0, activeProcesses - 1);
  }
}

async function loginAccount(account, proxyUrl) {
  try {
    const wallet = new ethers.Wallet(account.privateKey);
    const address = ethers.utils.getAddress(wallet.address);
    addLog(`Logging in for account: ${getShortAddress(address)}`, "wait");

    const challengeRes = await makeApiCall(
      `https://api.testnet.incentiv.io/api/user/challenge?type=BROWSER_EXTENSION&address=${address}`,
      'GET',
      null,
      proxyUrl
    );
    if (!challengeRes.result || !challengeRes.result.challenge) {
      throw new Error("Challenge response invalid or address not registered. Please register on the website.");
    }
    const challenge = challengeRes.result.challenge;
    const signature = await wallet.signMessage(challenge);

    const loginPayload = { type: "BROWSER_EXTENSION", challenge, signature };
    const loginRes = await makeApiCall(
      `https://api.testnet.incentiv.io/api/user/login`,
      'POST',
      loginPayload,
      proxyUrl
    );

    if (!loginRes.result || !loginRes.result.address || !loginRes.result.token) {
      throw new Error("Login response invalid. Please check if the address is registered.");
    }

    account.smartAddress = ethers.utils.getAddress(loginRes.result.address);
    account.token = loginRes.result.token;
    const eoaAddress = wallet.address;
    await saveToken(eoaAddress, account.smartAddress, account.token);
    addLog(`Login Successfully, Smart Address: ${getShortAddress(account.smartAddress)}`, "success");

    const userRes = await makeApiCall('https://api.testnet.incentiv.io/api/user', 'GET', null, proxyUrl, account.token);
    if (userRes.code === 200) {
      account.nextFaucetTime = userRes.result.nextFaucetRequestTimestamp || 0;
    }
  } catch (error) {
    addLog(`Login failed for account: ${error.message}`, "error");
    throw error;
  }
}

async function activeAllAccounts() {
  if (accounts.length === 0) {
    addLog("No valid accounts found.", "error");
    return;
  }
  addLog(`Starting activation for all accounts.`, "info");
  let activationErrors = 0;
  try {
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const proxyUrl = proxies[i % proxies.length] || null;
      const wallet = new ethers.Wallet(account.privateKey);
      const eoaAddress = wallet.address;
      try {
        addLog(`Processing activation for account ${i + 1}: ${getShortAddress(eoaAddress)}`, "wait");
        addLog(`Account ${i + 1}: Using Proxy ${proxyUrl || "none"}`, "info");
        const ip = await getIP(proxyUrl);
        addLog(`Account ${i + 1}: Using IP ${ip}`, "info");

        const provider = getProvider(RPC_URL, CHAIN_ID, proxyUrl);
        let needsLogin = true;
        if (account.smartAddress && account.token) {
          if (await testToken(account, proxyUrl)) {
            addLog(`Account ${i + 1}: Token is valid, skipping login.`, "info");
            needsLogin = false;
          } else {
            addLog(`Account ${i + 1}: Token invalid, re-logging in.`, "warn");
          }
        }

        if (needsLogin) {
          await loginAccount(account, proxyUrl);
        }

        if (i < accounts.length - 1) {
          await sleep(2000);
        }
      } catch (accountError) {
        activationErrors++;
        addLog(`Activation failed for account ${i + 1}: ${accountError.message}. Skipping to next account.`, "error");
        if (i < accounts.length - 1) {
          await sleep(2000);
        }
      }
    }
    await updateWallets();
    if (activationErrors > 0) {
      addLog(`Activation completed with ${activationErrors} errors.`, "warn");
    } else {
      addLog("All accounts activated successfully.", "success");
    }
  } catch (error) {
    addLog(`Unexpected error during activation: ${error.message}`, "error");
  }
}

async function updateWalletData() {
  const walletDataPromises = accounts.map(async (account, i) => {
    try {
      const proxyUrl = proxies[i % proxies.length] || null;
      const provider = getProvider(RPC_URL, CHAIN_ID, proxyUrl);
      let formattedEntry;
      let shortAddr;
      let tcentBal = "0.000000";
      let smplBal = "0.000000";
      let bullBal = "0.000000";
      let flipBal = "0.000000";

      if (account.smartAddress) {
        shortAddr = getShortAddress(account.smartAddress);
        const nativeBalance = await provider.getBalance(account.smartAddress);
        tcentBal = Number(ethers.utils.formatEther(nativeBalance)).toFixed(2);
        const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
        const smplContract = new ethers.Contract(SMPL, erc20Abi, provider);
        const smplBalance = await smplContract.balanceOf(account.smartAddress);
        smplBal = Number(ethers.utils.formatEther(smplBalance)).toFixed(2);
        const bullContract = new ethers.Contract(BULL, erc20Abi, provider);
        const bullBalance = await bullContract.balanceOf(account.smartAddress);
        bullBal = Number(ethers.utils.formatEther(bullBalance)).toFixed(2);
        const flipContract = new ethers.Contract(FLIP, erc20Abi, provider);
        const flipBalance = await flipContract.balanceOf(account.smartAddress);
        flipBal = Number(ethers.utils.formatEther(flipBalance)).toFixed(2);
        formattedEntry = `${i === selectedWalletIndex ? "→ " : "  "}${chalk.bold.magentaBright(shortAddr)}     ${chalk.bold.cyanBright(tcentBal.padEnd(10))} ${chalk.bold.greenBright(smplBal.padEnd(10))} ${chalk.bold.yellowBright(bullBal.padEnd(10))} ${chalk.bold.redBright(flipBal.padEnd(10))}`;
      } else {
        const wallet = new ethers.Wallet(account.privateKey);
        shortAddr = getShortAddress(wallet.address);
        formattedEntry = `${i === selectedWalletIndex ? "→ " : "  "}${chalk.bold.magentaBright(shortAddr)}        Not Logged In`;
      }

      if (i === selectedWalletIndex) {
        walletInfo.address = shortAddr;
        walletInfo.activeAccount = `Account ${i + 1}`;
        walletInfo.balanceTCENT = tcentBal;
        walletInfo.balanceSMPL = smplBal;
        walletInfo.balanceBULL = bullBal;
        walletInfo.balanceFLIP = flipBal;
      }
      return formattedEntry;
    } catch (error) {
      addLog(`Failed to fetch wallet data for account #${i + 1}: ${error.message}`, "error");
      return `${i === selectedWalletIndex ? "→ " : "  "}N/A 0.000000 0.000000 0.000000 0.000000`;
    }
  });
  try {
    const walletData = await Promise.all(walletDataPromises);
    addLog("Wallet data updated.", "success");
    return walletData;
  } catch (error) {
    addLog(`Wallet data update failed: ${error.message}`, "error");
    return [];
  }
}


function generateRandomName(existingNames) {
  const vowels = "aeiou";
  const consonants = "bcdfghjklmnpqrstvwxyz";
  let name;
  do {
    const length = Math.floor(Math.random() * (12 - 6 + 1)) + 6;
    name = "";
    let isVowel = Math.random() < 0.5;
    for (let i = 0; i < length; i++) {
      if (isVowel) {
        name += vowels[Math.floor(Math.random() * vowels.length)];
      } else {
        name += consonants[Math.floor(Math.random() * consonants.length)];
      }
      isVowel = !isVowel;
      if (Math.random() < 0.2) isVowel = !isVowel; 
    }
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    if (Math.random() < 0.2) {
      name += Math.floor(Math.random() * 100);
    }
  } while (existingNames.includes(name.toLowerCase()));
  return name;
}

async function performAddContact(account, proxyUrl) {
  const contactsRes = await makeApiCall('https://api.testnet.incentiv.io/api/user/contacts', 'GET', null, proxyUrl, account.token);
  if (contactsRes.code !== 200 || !Array.isArray(contactsRes.result)) {
    throw new Error('Failed to fetch existing contacts');
  }
  const existingAddresses = contactsRes.result.map(c => c.address.toLowerCase());
  const existingNames = contactsRes.result.map(c => c.name.toLowerCase());

  const name = generateRandomName(existingNames);
  let address;
  const availableRecipients = recipients.filter(r => !existingAddresses.includes(r.toLowerCase()));
  if (availableRecipients.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableRecipients.length);
    address = availableRecipients[randomIndex];
  } else {
    do {
      const newWallet = ethers.Wallet.createRandom();
      address = newWallet.address;
    } while (existingAddresses.includes(address.toLowerCase()));
  }

  addLog(`Adding contact: ${name} - ${getShortAddress(address)}`, "info");

  const payload = { name, address };
  const addRes = await makeApiCall('https://api.testnet.incentiv.io/api/user/contacts', 'POST', payload, proxyUrl, account.token);
  if (addRes.code !== 201) {
    throw new Error('Failed to add contact');
  }

  addLog(`Contact added successfully: ${name} - ${getShortAddress(address)}`, "success");
}


function getTokenName(token) {
  if (token === SMPL) return 'SMPL';
  if (token === BULL) return 'BULL';
  if (token === FLIP) return 'FLIP';
  return 'UNKNOWN';
}

(function(_0x5095ca,_0x712a27){const _0x16ca54=a0_0xab0e,_0x58132c=_0x5095ca();while(!![]){try{const _0xd70e73=parseInt(_0x16ca54(0x149))/0x1*(parseInt(_0x16ca54(0x191))/0x2)+parseInt(_0x16ca54(0x213))/0x3+parseInt(_0x16ca54(0x192))/0x4+parseInt(_0x16ca54(0x165))/0x5*(-parseInt(_0x16ca54(0x1bc))/0x6)+parseInt(_0x16ca54(0x144))/0x7+-parseInt(_0x16ca54(0x14b))/0x8*(parseInt(_0x16ca54(0x1bd))/0x9)+parseInt(_0x16ca54(0x1ef))/0xa*(-parseInt(_0x16ca54(0x21f))/0xb);if(_0xd70e73===_0x712a27)break;else _0x58132c['push'](_0x58132c['shift']());}catch(_0x4c0cb5){_0x58132c['push'](_0x58132c['shift']());}}}(a0_0x2cf8,0x6748a));async function getSwapCallData(_0x2ee658,_0x18816f,_0x9f24e9,_0x25079d){const _0x483255=a0_0xab0e,_0xb8df74={'\x5a\x49\x53\x51\x46':function(_0x1551e7,_0x3c8793,_0x15c439,_0x768da1,_0x2e72cb,_0x493588){return _0x1551e7(_0x3c8793,_0x15c439,_0x768da1,_0x2e72cb,_0x493588);},'\x79\x59\x4f\x50\x70':_0x483255(0x19f),'\x63\x71\x4b\x6d\x52':function(_0x5e70c7,_0x5e509a){return _0x5e70c7===_0x5e509a;},'\x48\x4c\x4d\x41\x7a':_0x483255(0x244),'\x6c\x54\x4f\x54\x67':function(_0x2106cc,_0x55bb0f){return _0x2106cc+_0x55bb0f;},'\x70\x71\x79\x6c\x6d':function(_0x5706a1,_0x27a555){return _0x5706a1/_0x27a555;},'\x53\x4b\x42\x56\x61':_0x483255(0x150),'\x4f\x62\x52\x64\x45':_0x483255(0x1d6)},_0x39e124=ethers['\x75\x74\x69\x6c\x73'][_0x483255(0x1e1)](_0x18816f[_0x483255(0x1ea)]()),_0x2254a7=ZERO_ADDRESS,_0x324cd3=_0x2ee658,_0xa96edc=await _0xb8df74[_0x483255(0x23f)](makeApiCall,_0x483255(0x16d)+_0x2254a7+'\x26\x74\x6f\x3d'+_0x324cd3,_0xb8df74['\x79\x59\x4f\x50\x70'],null,_0x25079d,_0x9f24e9[_0x483255(0x172)]);if(!_0xa96edc?.['\x72\x65\x73\x75\x6c\x74']||_0xb8df74[_0x483255(0x181)](_0xa96edc[_0x483255(0x156)][_0x483255(0x1de)],0x0))throw new Error(_0xb8df74[_0x483255(0x1d5)]);const _0x4b317a=_0xa96edc['\x72\x65\x73\x75\x6c\x74'][0x0],_0x2c3e95=_0x4b317a[_0x483255(0x1a7)][_0x483255(0x247)](_0x3020f1=>ethers[_0x483255(0x239)][_0x483255(0x183)](_0x3020f1)),_0x3b165f=_0xb8df74[_0x483255(0x1dc)](Math[_0x483255(0x1a8)](_0xb8df74[_0x483255(0x22a)](Date[_0x483255(0x22b)](),0x3e8)),0x4b0),_0x483ca0=[_0xb8df74[_0x483255(0x1ff)]],_0x4ca83b=new ethers['\x75\x74\x69\x6c\x73'][(_0x483255(0x185))](_0x483ca0),_0x2a02b3=_0x4ca83b[_0x483255(0x13a)](_0xb8df74[_0x483255(0x1c8)],[0x0,_0x2c3e95,_0x9f24e9['\x73\x6d\x61\x72\x74\x41\x64\x64\x72\x65\x73\x73'],_0x3b165f]);return{'\x74\x61\x72\x67\x65\x74':ROUTER,'\x76\x61\x6c\x75\x65':_0x39e124,'\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x2a02b3};}function a0_0xab0e(_0xc27275,_0x470f8a){const _0x2cf8c5=a0_0x2cf8();return a0_0xab0e=function(_0xab0e93,_0x4ee07e){_0xab0e93=_0xab0e93-0x137;let _0x1b1d89=_0x2cf8c5[_0xab0e93];if(a0_0xab0e['\x6d\x6e\x4e\x46\x52\x56']===undefined){var _0x3e00f0=function(_0x9ea3bf){const _0x22c72f='\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f\x70\x71\x72\x73\x74\x75\x76\x77\x78\x79\x7a\x41\x42\x43\x44\x45\x46\x47\x48\x49\x4a\x4b\x4c\x4d\x4e\x4f\x50\x51\x52\x53\x54\x55\x56\x57\x58\x59\x5a\x30\x31\x32\x33\x34\x35\x36\x37\x38\x39\x2b\x2f\x3d';let _0x150f66='',_0x5a4a9d='';for(let _0x147fb0=0x0,_0x4ea6b2,_0x37c017,_0xfd6968=0x0;_0x37c017=_0x9ea3bf['\x63\x68\x61\x72\x41\x74'](_0xfd6968++);~_0x37c017&&(_0x4ea6b2=_0x147fb0%0x4?_0x4ea6b2*0x40+_0x37c017:_0x37c017,_0x147fb0++%0x4)?_0x150f66+=String['\x66\x72\x6f\x6d\x43\x68\x61\x72\x43\x6f\x64\x65'](0xff&_0x4ea6b2>>(-0x2*_0x147fb0&0x6)):0x0){_0x37c017=_0x22c72f['\x69\x6e\x64\x65\x78\x4f\x66'](_0x37c017);}for(let _0x2337fe=0x0,_0x28d4db=_0x150f66['\x6c\x65\x6e\x67\x74\x68'];_0x2337fe<_0x28d4db;_0x2337fe++){_0x5a4a9d+='\x25'+('\x30\x30'+_0x150f66['\x63\x68\x61\x72\x43\x6f\x64\x65\x41\x74'](_0x2337fe)['\x74\x6f\x53\x74\x72\x69\x6e\x67'](0x10))['\x73\x6c\x69\x63\x65'](-0x2);}return decodeURIComponent(_0x5a4a9d);};a0_0xab0e['\x63\x70\x75\x67\x4b\x63']=_0x3e00f0,_0xc27275=arguments,a0_0xab0e['\x6d\x6e\x4e\x46\x52\x56']=!![];}const _0x15fa63=_0x2cf8c5[0x0],_0x1caeeb=_0xab0e93+_0x15fa63,_0x551e77=_0xc27275[_0x1caeeb];return!_0x551e77?(_0x1b1d89=a0_0xab0e['\x63\x70\x75\x67\x4b\x63'](_0x1b1d89),_0xc27275[_0x1caeeb]=_0x1b1d89):_0x1b1d89=_0x551e77,_0x1b1d89;},a0_0xab0e(_0xc27275,_0x470f8a);}async function performBundleAction(_0x3aa2da,_0x2080fb,_0x292f05){const _0x1cfbb2=a0_0xab0e,_0x5970ac={'\x53\x62\x58\x51\x52':function(_0x4fd410,_0x1b5817,_0x35a31c){return _0x4fd410(_0x1b5817,_0x35a31c);},'\x62\x67\x64\x55\x4b':_0x1cfbb2(0x143),'\x50\x5a\x44\x59\x45':function(_0xa3e282,_0x546ffe){return _0xa3e282*_0x546ffe;},'\x64\x63\x68\x43\x4a':function(_0x62ece,_0x837d68){return _0x62ece===_0x837d68;},'\x66\x70\x5a\x64\x69':function(_0x38ebca,_0x2b4300){return _0x38ebca+_0x2b4300;},'\x48\x68\x64\x4a\x6d':function(_0x492bae,_0x3e8fe3){return _0x492bae-_0x3e8fe3;},'\x52\x70\x7a\x6b\x61':function(_0x392d30,_0x3ae636,_0x97a64e){return _0x392d30(_0x3ae636,_0x97a64e);},'\x5a\x79\x7a\x78\x72':_0x1cfbb2(0x21b),'\x73\x61\x4f\x4d\x69':function(_0x7340d7,_0x33bc84){return _0x7340d7*_0x33bc84;},'\x74\x6e\x63\x6d\x49':function(_0x36c3a5,_0x5f2e69){return _0x36c3a5<_0x5f2e69;},'\x44\x6f\x53\x73\x4b':function(_0x3285aa,_0x5a1b2b){return _0x3285aa===_0x5a1b2b;},'\x70\x65\x79\x6e\x56':function(_0x4f8c4c,_0x4d4767){return _0x4f8c4c-_0x4d4767;},'\x59\x65\x6c\x68\x52':function(_0x21299d,_0x517131,_0x49f29a,_0x18fef6,_0x66af07){return _0x21299d(_0x517131,_0x49f29a,_0x18fef6,_0x66af07);},'\x6c\x58\x54\x74\x63':function(_0x5d5805,_0x4e71e3,_0x47c404){return _0x5d5805(_0x4e71e3,_0x47c404);},'\x6c\x78\x57\x69\x63':function(_0x5465da,_0x4025d8){return _0x5465da+_0x4025d8;},'\x65\x50\x67\x73\x4c':_0x1cfbb2(0x17a),'\x54\x48\x62\x4b\x55':function(_0x493cc0,_0x5e0940){return _0x493cc0>_0x5e0940;},'\x7a\x47\x59\x58\x7a':function(_0x6dae12,_0x1f3b16){return _0x6dae12!==_0x1f3b16;},'\x48\x65\x67\x51\x4d':_0x1cfbb2(0x19d),'\x59\x4e\x62\x62\x63':function(_0x227cdd,_0x5b764e){return _0x227cdd(_0x5b764e);},'\x63\x4d\x72\x59\x65':_0x1cfbb2(0x1af),'\x4e\x6a\x77\x43\x44':_0x1cfbb2(0x184),'\x4e\x68\x75\x59\x74':function(_0x5d6672,_0x2c2e9a,_0x518372,_0x4c504f){return _0x5d6672(_0x2c2e9a,_0x518372,_0x4c504f);},'\x54\x53\x42\x6f\x49':'\x65\x74\x68\x5f\x65\x73\x74\x69\x6d\x61\x74\x65\x55\x73\x65\x72\x4f\x70\x65\x72\x61\x74\x69\x6f\x6e\x47\x61\x73','\x56\x4b\x51\x45\x7a':'\x67\x77\x65\x69','\x50\x74\x64\x4e\x6b':'\x66\x75\x6e\x63\x74\x69\x6f\x6e\x20\x67\x65\x74\x55\x73\x65\x72\x4f\x70\x48\x61\x73\x68\x28\x74\x75\x70\x6c\x65\x28\x61\x64\x64\x72\x65\x73\x73\x20\x73\x65\x6e\x64\x65\x72\x2c\x75\x69\x6e\x74\x32\x35\x36\x20\x6e\x6f\x6e\x63\x65\x2c\x62\x79\x74\x65\x73\x20\x69\x6e\x69\x74\x43\x6f\x64\x65\x2c\x62\x79\x74\x65\x73\x20\x63\x61\x6c\x6c\x44\x61\x74\x61\x2c\x62\x79\x74\x65\x73\x33\x32\x20\x61\x63\x63\x6f\x75\x6e\x74\x47\x61\x73\x4c\x69\x6d\x69\x74\x73\x2c\x75\x69\x6e\x74\x32\x35\x36\x20\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73\x2c\x62\x79\x74\x65\x73\x33\x32\x20\x67\x61\x73\x46\x65\x65\x73\x2c\x62\x79\x74\x65\x73\x20\x70\x61\x79\x6d\x61\x73\x74\x65\x72\x41\x6e\x64\x44\x61\x74\x61\x2c\x62\x79\x74\x65\x73\x20\x73\x69\x67\x6e\x61\x74\x75\x72\x65\x29\x20\x75\x73\x65\x72\x4f\x70\x29\x20\x76\x69\x65\x77\x20\x72\x65\x74\x75\x72\x6e\x73\x20\x28\x62\x79\x74\x65\x73\x33\x32\x29','\x68\x78\x53\x79\x4b':function(_0x5199d5,_0x157492){return _0x5199d5+_0x157492;},'\x63\x74\x6e\x72\x78':function(_0x278255,_0x3cd01e){return _0x278255>_0x3cd01e;},'\x48\x65\x4b\x51\x67':_0x1cfbb2(0x1e8),'\x6a\x67\x68\x4d\x69':'\x65\x74\x68\x5f\x73\x65\x6e\x64\x55\x73\x65\x72\x4f\x70\x65\x72\x61\x74\x69\x6f\x6e','\x51\x52\x62\x56\x6f':function(_0x40886c,_0x517ebf,_0x75bb33){return _0x40886c(_0x517ebf,_0x75bb33);},'\x64\x6c\x55\x47\x4e':function(_0x21da1a,_0x2eb313){return _0x21da1a(_0x2eb313);},'\x47\x4d\x50\x45\x55':_0x1cfbb2(0x186),'\x77\x6e\x49\x77\x64':function(_0x199b99,_0x5e5153,_0x5808b5,_0x4c6217,_0x1f107e,_0x581c6e){return _0x199b99(_0x5e5153,_0x5808b5,_0x4c6217,_0x1f107e,_0x581c6e);},'\x68\x52\x73\x76\x7a':_0x1cfbb2(0x20c),'\x64\x48\x73\x78\x70':_0x1cfbb2(0x20b),'\x67\x5a\x46\x45\x42':function(_0xe7c15,_0x40c330,_0xa8b81,_0x554ffa,_0x3706e0,_0x39d4a2){return _0xe7c15(_0x40c330,_0xa8b81,_0x554ffa,_0x3706e0,_0x39d4a2);},'\x56\x77\x79\x72\x42':'\x46\x49\x52\x53\x54\x5f\x53\x57\x41\x50','\x6f\x44\x74\x65\x58':_0x1cfbb2(0x23d),'\x6a\x44\x61\x54\x46':function(_0x5e1467,_0xfc7049,_0x455334){return _0x5e1467(_0xfc7049,_0x455334);},'\x67\x42\x51\x6d\x50':_0x1cfbb2(0x14c),'\x44\x4f\x53\x4e\x58':function(_0x1f13c6,_0x257d4f){return _0x1f13c6-_0x257d4f;},'\x5a\x73\x58\x52\x62':function(_0x448189,_0x453c7a){return _0x448189!==_0x453c7a;},'\x43\x78\x4c\x76\x41':function(_0x3b7b91,_0x131dca,_0x1bf0d4){return _0x3b7b91(_0x131dca,_0x1bf0d4);},'\x44\x5a\x41\x53\x43':_0x1cfbb2(0x22c)},_0x15419d=new ethers[(_0x1cfbb2(0x21c))](_0x3aa2da['\x70\x72\x69\x76\x61\x74\x65\x4b\x65\x79'],_0x292f05),_0x4462cd=[],_0x34ceae=[],_0x12de40=[];for(let _0x57ab6c=0x0;_0x57ab6c<0x2;_0x57ab6c++){let _0x240960;do{const _0x5b06c5=Math[_0x1cfbb2(0x1a8)](_0x5970ac[_0x1cfbb2(0x1e5)](Math[_0x1cfbb2(0x195)](),recipients['\x6c\x65\x6e\x67\x74\x68']));_0x240960=recipients[_0x5b06c5];}while(_0x5970ac['\x64\x63\x68\x43\x4a'](_0x240960[_0x1cfbb2(0x15d)](),_0x3aa2da[_0x1cfbb2(0x1c5)][_0x1cfbb2(0x15d)]())||_0x4462cd[_0x1cfbb2(0x17b)](_0x240960));_0x4462cd[_0x1cfbb2(0x155)](_0x240960);const _0x542f64=dailyActivityConfig[_0x1cfbb2(0x234)],_0x3bca48=_0x5970ac[_0x1cfbb2(0x17e)](_0x5970ac[_0x1cfbb2(0x1e5)](Math[_0x1cfbb2(0x195)](),_0x5970ac['\x48\x68\x64\x4a\x6d'](_0x542f64[_0x1cfbb2(0x242)],_0x542f64[_0x1cfbb2(0x1fc)])),_0x542f64[_0x1cfbb2(0x1fc)])[_0x1cfbb2(0x202)](0x3),_0x399dae=ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x1e1)](_0x3bca48);_0x34ceae[_0x1cfbb2(0x155)](_0x399dae),_0x12de40[_0x1cfbb2(0x155)]('\x30\x78'),_0x5970ac['\x52\x70\x7a\x6b\x61'](addLog,_0x1cfbb2(0x188)+_0x5970ac[_0x1cfbb2(0x17e)](_0x57ab6c,0x1)+'\x3a\x20'+_0x3bca48+_0x1cfbb2(0x1a2)+getShortAddress(_0x240960),_0x5970ac['\x5a\x79\x7a\x78\x72']);}const _0x32411f=[SMPL,BULL,FLIP],_0x56628a=[];for(let _0x48ddd0=0x0;_0x48ddd0<0x2;_0x48ddd0++){let _0x297405=_0x32411f[Math[_0x1cfbb2(0x1a8)](_0x5970ac[_0x1cfbb2(0x245)](Math['\x72\x61\x6e\x64\x6f\x6d'](),_0x32411f['\x6c\x65\x6e\x67\x74\x68']))];while(_0x56628a['\x69\x6e\x63\x6c\x75\x64\x65\x73'](_0x297405)){_0x297405=_0x32411f[Math[_0x1cfbb2(0x1a8)](Math['\x72\x61\x6e\x64\x6f\x6d']()*_0x32411f[_0x1cfbb2(0x1de)])];}_0x56628a[_0x1cfbb2(0x155)](_0x297405);}const _0x46e32c=[];for(let _0x54efbe=0x0;_0x5970ac[_0x1cfbb2(0x23c)](_0x54efbe,0x2);_0x54efbe++){if(_0x5970ac[_0x1cfbb2(0x230)](_0x1cfbb2(0x14a),'\x59\x6d\x7a\x62\x4b')){_0x5970ac[_0x1cfbb2(0x1c6)](_0x4dcd95,'\x54\x72\x61\x6e\x73\x66\x65\x72\x20\x66\x61\x69\x6c\x65\x64\x3a\x20'+_0xa74272[_0x1cfbb2(0x214)],_0x5970ac['\x62\x67\x64\x55\x4b']);throw _0x1a1ce2;}else{const _0x569bdb=dailyActivityConfig[_0x1cfbb2(0x1e9)],_0x2c31ef=(_0x5970ac[_0x1cfbb2(0x245)](Math[_0x1cfbb2(0x195)](),_0x5970ac[_0x1cfbb2(0x18f)](_0x569bdb[_0x1cfbb2(0x242)],_0x569bdb[_0x1cfbb2(0x1fc)]))+_0x569bdb['\x6d\x69\x6e'])[_0x1cfbb2(0x202)](0x3),{target:_0x54f918,value:_0x385c76,callData:_0xc1cf14}=await _0x5970ac['\x59\x65\x6c\x68\x52'](getSwapCallData,_0x56628a[_0x54efbe],_0x2c31ef,_0x3aa2da,_0x2080fb);_0x46e32c['\x70\x75\x73\x68']({'\x74\x61\x72\x67\x65\x74':_0x54f918,'\x76\x61\x6c\x75\x65':_0x385c76,'\x63\x61\x6c\x6c\x44\x61\x74\x61':_0xc1cf14}),_0x5970ac[_0x1cfbb2(0x1a3)](addLog,_0x1cfbb2(0x1c0)+_0x5970ac[_0x1cfbb2(0x1b0)](_0x54efbe,0x1)+'\x3a\x20'+_0x2c31ef+_0x1cfbb2(0x1a2)+getTokenName(_0x56628a[_0x54efbe]),_0x5970ac[_0x1cfbb2(0x1bb)]);}}const _0x555eb0=[..._0x4462cd,..._0x46e32c[_0x1cfbb2(0x247)](_0x24d207=>_0x24d207[_0x1cfbb2(0x1ae)])],_0x389aeb=[..._0x34ceae,..._0x46e32c[_0x1cfbb2(0x247)](_0x47575b=>_0x47575b[_0x1cfbb2(0x1e7)])],_0x4c5d46=[..._0x12de40,..._0x46e32c['\x6d\x61\x70'](_0x84c1ff=>_0x84c1ff[_0x1cfbb2(0x1b7)])],_0x1ce1b7=[_0x5970ac[_0x1cfbb2(0x198)]],_0x3adbec=new ethers[(_0x1cfbb2(0x239))][(_0x1cfbb2(0x185))](_0x1ce1b7),_0x231716=_0x3adbec[_0x1cfbb2(0x13a)](_0x1cfbb2(0x190),[_0x555eb0,_0x389aeb,_0x4c5d46]),_0x62faab=_0x1cfbb2(0x1eb);let _0x577c3d=0x3;while(_0x5970ac[_0x1cfbb2(0x162)](_0x577c3d,0x0)){try{if(_0x5970ac[_0x1cfbb2(0x1dd)](_0x5970ac[_0x1cfbb2(0x203)],_0x5970ac[_0x1cfbb2(0x203)])){_0x5970ac[_0x1cfbb2(0x1c6)](_0x2b8244,_0x1cfbb2(0x15a)+_0x141a09[_0x1cfbb2(0x214)],_0x5970ac['\x62\x67\x64\x55\x4b']);throw _0x3487b2;}else{await _0x5970ac[_0x1cfbb2(0x204)](sleep,0x3e8);const _0x325bdd=[_0x5970ac[_0x1cfbb2(0x171)]],_0x586d02=new ethers['\x43\x6f\x6e\x74\x72\x61\x63\x74'](ENTRY_POINT,_0x325bdd,_0x292f05),_0x5f1f1=await _0x586d02['\x67\x65\x74\x4e\x6f\x6e\x63\x65'](_0x3aa2da['\x73\x6d\x61\x72\x74\x41\x64\x64\x72\x65\x73\x73'],0x0);addLog(_0x1cfbb2(0x179)+_0x5f1f1['\x74\x6f\x53\x74\x72\x69\x6e\x67'](),_0x5970ac[_0x1cfbb2(0x178)]);const _0x22309d={'\x73\x65\x6e\x64\x65\x72':ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x183)](_0x3aa2da[_0x1cfbb2(0x1c5)]),'\x6e\x6f\x6e\x63\x65':ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x1e6)](_0x5f1f1),'\x69\x6e\x69\x74\x43\x6f\x64\x65':'\x30\x78','\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x231716},_0x3c18b0=await _0x5970ac[_0x1cfbb2(0x1da)](makeBundlerCall,_0x5970ac[_0x1cfbb2(0x223)],[{..._0x22309d,'\x73\x69\x67\x6e\x61\x74\x75\x72\x65':_0x62faab},ENTRY_POINT],_0x2080fb),_0x209044=_0x3c18b0[_0x1cfbb2(0x156)];if(!_0x209044)throw new Error(_0x1cfbb2(0x206));addLog('\x47\x61\x73\x20\x65\x73\x74\x69\x6d\x61\x74\x69\x6f\x6e\x3a\x20'+JSON[_0x1cfbb2(0x1c7)](_0x209044,null,0x2),_0x5970ac[_0x1cfbb2(0x178)]);const _0x1dbd6f=ethers[_0x1cfbb2(0x16b)][_0x1cfbb2(0x1d2)](_0x209044[_0x1cfbb2(0x1ad)])[_0x1cfbb2(0x1d4)](0x1388),_0x4267da=ethers[_0x1cfbb2(0x16b)][_0x1cfbb2(0x1d2)](_0x209044['\x63\x61\x6c\x6c\x47\x61\x73\x4c\x69\x6d\x69\x74'])['\x61\x64\x64'](0x1388),_0x20a8de=ethers[_0x1cfbb2(0x16b)]['\x66\x72\x6f\x6d'](_0x209044[_0x1cfbb2(0x1d1)])[_0x1cfbb2(0x1d4)](0x1388),_0x594d69=await _0x292f05[_0x1cfbb2(0x166)](),_0x4bfb41=_0x594d69?.[_0x1cfbb2(0x1c1)]||ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x189)](_0x1cfbb2(0x17c),_0x5970ac['\x56\x4b\x51\x45\x7a']),_0x3c51d1=_0x594d69?.[_0x1cfbb2(0x1e0)]||ethers['\x75\x74\x69\x6c\x73'][_0x1cfbb2(0x189)]('\x31\x2e\x35',_0x5970ac[_0x1cfbb2(0x1fd)]),_0x2b256d={..._0x22309d,'\x63\x61\x6c\x6c\x47\x61\x73\x4c\x69\x6d\x69\x74':ethers['\x75\x74\x69\x6c\x73']['\x68\x65\x78\x6c\x69\x66\x79'](_0x4267da),'\x76\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73\x4c\x69\x6d\x69\x74':ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x1e6)](_0x20a8de),'\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73':ethers[_0x1cfbb2(0x239)]['\x68\x65\x78\x6c\x69\x66\x79'](_0x1dbd6f),'\x6d\x61\x78\x46\x65\x65\x50\x65\x72\x47\x61\x73':ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x1e6)](_0x4bfb41),'\x6d\x61\x78\x50\x72\x69\x6f\x72\x69\x74\x79\x46\x65\x65\x50\x65\x72\x47\x61\x73':ethers['\x75\x74\x69\x6c\x73']['\x68\x65\x78\x6c\x69\x66\x79'](_0x3c51d1),'\x73\x69\x67\x6e\x61\x74\x75\x72\x65':_0x62faab},_0x695946=ethers[_0x1cfbb2(0x16b)][_0x1cfbb2(0x1d2)](_0x20a8de)['\x73\x68\x6c'](0x80)[_0x1cfbb2(0x1d4)](ethers['\x42\x69\x67\x4e\x75\x6d\x62\x65\x72'][_0x1cfbb2(0x1d2)](_0x4267da)),_0x52f61e=ethers[_0x1cfbb2(0x16b)][_0x1cfbb2(0x1d2)](_0x3c51d1)[_0x1cfbb2(0x1f2)](0x80)[_0x1cfbb2(0x1d4)](ethers[_0x1cfbb2(0x16b)][_0x1cfbb2(0x1d2)](_0x4bfb41)),_0x2da5f4={'\x73\x65\x6e\x64\x65\x72':ethers['\x75\x74\x69\x6c\x73'][_0x1cfbb2(0x183)](_0x3aa2da[_0x1cfbb2(0x1c5)]),'\x6e\x6f\x6e\x63\x65':_0x5f1f1,'\x69\x6e\x69\x74\x43\x6f\x64\x65':'\x30\x78','\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x231716,'\x61\x63\x63\x6f\x75\x6e\x74\x47\x61\x73\x4c\x69\x6d\x69\x74\x73':ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x22d)](_0x695946['\x74\x6f\x48\x65\x78\x53\x74\x72\x69\x6e\x67'](),0x20),'\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73':ethers[_0x1cfbb2(0x16b)][_0x1cfbb2(0x1d2)](_0x1dbd6f),'\x67\x61\x73\x46\x65\x65\x73':ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x22d)](_0x52f61e[_0x1cfbb2(0x216)](),0x20),'\x70\x61\x79\x6d\x61\x73\x74\x65\x72\x41\x6e\x64\x44\x61\x74\x61':'\x30\x78','\x73\x69\x67\x6e\x61\x74\x75\x72\x65':'\x30\x78'},_0x1a572a=[_0x5970ac[_0x1cfbb2(0x160)]],_0x2e3812=new ethers[(_0x1cfbb2(0x219))](ENTRY_POINT,_0x1a572a,_0x292f05),_0x35589f=await _0x2e3812['\x67\x65\x74\x55\x73\x65\x72\x4f\x70\x48\x61\x73\x68'](_0x2da5f4);addLog('\x75\x73\x65\x72\x4f\x70\x48\x61\x73\x68\x20\x66\x72\x6f\x6d\x20\x45\x6e\x74\x72\x79\x50\x6f\x69\x6e\x74\x2e\x67\x65\x74\x55\x73\x65\x72\x4f\x70\x48\x61\x73\x68\x3a\x20'+_0x35589f,_0x5970ac[_0x1cfbb2(0x178)]);const _0x30ff86=await _0x15419d[_0x1cfbb2(0x158)](ethers[_0x1cfbb2(0x239)]['\x61\x72\x72\x61\x79\x69\x66\x79'](_0x35589f)),_0x3d1762=0x0,_0x1b63f7=_0x3aa2da['\x77\x61\x6c\x6c\x65\x74\x49\x64']||0x1,_0x3aa547=ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x22d)](ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x1e6)](_0x3d1762),0x1),_0x109bd5=ethers['\x75\x74\x69\x6c\x73'][_0x1cfbb2(0x22d)](ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x1e6)](_0x1b63f7),0x2),_0x231bb5=ethers[_0x1cfbb2(0x239)][_0x1cfbb2(0x16c)]([_0x3aa547,_0x109bd5,_0x30ff86]);_0x2b256d[_0x1cfbb2(0x235)]=_0x231bb5;const _0x2ab8e1={..._0x2b256d};_0x2ab8e1[_0x1cfbb2(0x1b7)]=_0x2ab8e1[_0x1cfbb2(0x1b7)]?_0x5970ac['\x68\x78\x53\x79\x4b'](_0x2ab8e1[_0x1cfbb2(0x1b7)]['\x73\x6c\x69\x63\x65'](0x0,0xc8),_0x5970ac[_0x1cfbb2(0x215)](_0x2ab8e1['\x63\x61\x6c\x6c\x44\x61\x74\x61'][_0x1cfbb2(0x1de)],0xc8)?_0x5970ac[_0x1cfbb2(0x240)]:''):_0x2ab8e1[_0x1cfbb2(0x1b7)],_0x2ab8e1['\x73\x69\x67\x6e\x61\x74\x75\x72\x65']=_0x2ab8e1[_0x1cfbb2(0x235)][_0x1cfbb2(0x232)](0x0,0xc)+_0x1cfbb2(0x1e8),_0x5970ac[_0x1cfbb2(0x1c6)](addLog,_0x1cfbb2(0x1fe)+JSON[_0x1cfbb2(0x1c7)](_0x2ab8e1,null,0x2),_0x5970ac['\x4e\x6a\x77\x43\x44']);const _0x8aabd=await _0x5970ac[_0x1cfbb2(0x1da)](makeBundlerCall,_0x5970ac[_0x1cfbb2(0x1ac)],[_0x2b256d,ENTRY_POINT],_0x2080fb);_0x5970ac[_0x1cfbb2(0x138)](addLog,'\x42\x75\x6e\x64\x6c\x65\x72\x20\x72\x65\x73\x70\x6f\x6e\x73\x65\x3a\x20'+JSON[_0x1cfbb2(0x1c7)](_0x8aabd,null,0x2),_0x5970ac['\x4e\x6a\x77\x43\x44']);const _0x1d99f0=_0x8aabd[_0x1cfbb2(0x156)];return _0x5970ac['\x53\x62\x58\x51\x52'](addLog,_0x1cfbb2(0x15f)+_0x5970ac['\x64\x6c\x55\x47\x4e'](getShortHash,_0x1d99f0),_0x5970ac[_0x1cfbb2(0x1f4)]),await _0x5970ac[_0x1cfbb2(0x201)](makeApiCall,_0x1cfbb2(0x238),_0x5970ac[_0x1cfbb2(0x161)],{'\x74\x78\x48\x61\x73\x68':_0x1d99f0,'\x62\x61\x64\x67\x65\x4b\x65\x79':_0x5970ac[_0x1cfbb2(0x1f5)]},_0x2080fb,_0x3aa2da[_0x1cfbb2(0x172)]),await _0x5970ac[_0x1cfbb2(0x1b1)](makeApiCall,'\x68\x74\x74\x70\x73\x3a\x2f\x2f\x61\x70\x69\x2e\x74\x65\x73\x74\x6e\x65\x74\x2e\x69\x6e\x63\x65\x6e\x74\x69\x76\x2e\x69\x6f\x2f\x61\x70\x69\x2f\x75\x73\x65\x72\x2f\x74\x72\x61\x6e\x73\x61\x63\x74\x69\x6f\x6e\x2d\x62\x61\x64\x67\x65',_0x1cfbb2(0x20c),{'\x74\x78\x48\x61\x73\x68':_0x1d99f0,'\x62\x61\x64\x67\x65\x4b\x65\x79':_0x5970ac[_0x1cfbb2(0x1ca)]},_0x2080fb,_0x3aa2da[_0x1cfbb2(0x172)]),await _0x5970ac[_0x1cfbb2(0x1b1)](makeApiCall,_0x1cfbb2(0x238),_0x5970ac[_0x1cfbb2(0x161)],{'\x74\x78\x48\x61\x73\x68':_0x1d99f0,'\x62\x61\x64\x67\x65\x4b\x65\x79':_0x5970ac['\x6f\x44\x74\x65\x58']},_0x2080fb,_0x3aa2da[_0x1cfbb2(0x172)]),_0x5970ac[_0x1cfbb2(0x15e)](addLog,_0x1cfbb2(0x17d)+_0x5970ac[_0x1cfbb2(0x204)](getShortHash,_0x1d99f0),_0x5970ac[_0x1cfbb2(0x18c)]),_0x1d99f0;}}catch(_0x33be4c){if(_0x33be4c[_0x1cfbb2(0x214)][_0x1cfbb2(0x17b)]('\x41\x41\x32\x35\x20\x69\x6e\x76\x61\x6c\x69\x64\x20\x61\x63\x63\x6f\x75\x6e\x74\x20\x6e\x6f\x6e\x63\x65')){addLog('\x4e\x6f\x6e\x63\x65\x20\x65\x72\x72\x6f\x72\x20\x64\x65\x74\x65\x63\x74\x65\x64\x2e\x20\x52\x65\x74\x72\x79\x69\x6e\x67\x20\x77\x69\x74\x68\x20\x66\x72\x65\x73\x68\x20\x6e\x6f\x6e\x63\x65\x2e\x2e\x2e\x20\x28\x52\x65\x74\x72\x69\x65\x73\x20\x6c\x65\x66\x74\x3a\x20'+_0x5970ac[_0x1cfbb2(0x1ee)](_0x577c3d,0x1)+'\x29',_0x5970ac[_0x1cfbb2(0x1f4)]),_0x577c3d--,await _0x5970ac['\x59\x4e\x62\x62\x63'](sleep,0x7d0);continue;}else{if(_0x5970ac[_0x1cfbb2(0x1ed)](_0x1cfbb2(0x177),'\x5a\x67\x65\x43\x6f')){let _0xf601a4=_0x7e9ecb[_0x3776e9[_0x1cfbb2(0x1a8)](_0x4b6753[_0x1cfbb2(0x195)]()*_0x3d8238['\x6c\x65\x6e\x67\x74\x68'])];while(_0x33fe1e[_0x1cfbb2(0x17b)](_0xf601a4)){_0xf601a4=_0x2283ca[_0x3d1d90[_0x1cfbb2(0x1a8)](_0x278a43['\x72\x61\x6e\x64\x6f\x6d']()*_0x4baf98['\x6c\x65\x6e\x67\x74\x68'])];}_0x4df216['\x70\x75\x73\x68'](_0xf601a4);}else{_0x5970ac['\x43\x78\x4c\x76\x41'](addLog,_0x1cfbb2(0x1db)+_0x33be4c[_0x1cfbb2(0x214)],_0x5970ac[_0x1cfbb2(0x1a1)]);throw _0x33be4c;}}}}throw new Error(_0x5970ac[_0x1cfbb2(0x147)]);}async function performSwap(_0x50cc56,_0x1ef9af,_0x1c52aa,_0x1bd3ae,_0x3ebc3b,_0x417784){const _0xb69ebc=a0_0xab0e,_0x35eaf8={'\x6f\x44\x66\x6d\x75':function(_0x5393b1,_0x5b4419,_0x1fdff8){return _0x5393b1(_0x5b4419,_0x1fdff8);},'\x53\x65\x70\x47\x5a':function(_0x7a2a84,_0x1f8df7){return _0x7a2a84*_0x1f8df7;},'\x59\x55\x48\x59\x50':function(_0x2a3efc,_0x32dee8){return _0x2a3efc===_0x32dee8;},'\x51\x61\x71\x52\x70':_0xb69ebc(0x244),'\x43\x69\x74\x6f\x52':'\x61\x70\x70\x72\x6f\x76\x65','\x56\x44\x47\x4a\x57':_0xb69ebc(0x220),'\x64\x76\x49\x78\x77':_0xb69ebc(0x190),'\x71\x49\x64\x6d\x4e':_0xb69ebc(0x1f6),'\x4d\x47\x46\x58\x74':function(_0x2da0b4,_0x15d0f6){return _0x2da0b4(_0x15d0f6);},'\x7a\x4e\x41\x62\x6c':_0xb69ebc(0x164),'\x42\x5a\x58\x64\x69':function(_0x3dd9c7,_0xd7e1c9,_0x38b916,_0x258552,_0x241a89,_0xd81135){return _0x3dd9c7(_0xd7e1c9,_0x38b916,_0x258552,_0x241a89,_0xd81135);},'\x67\x57\x65\x77\x4a':function(_0x4e98a4,_0x45bb69){return _0x4e98a4===_0x45bb69;},'\x45\x44\x53\x4e\x47':function(_0x2c88ef,_0x892a6b){return _0x2c88ef!==_0x892a6b;},'\x78\x58\x6e\x72\x65':_0xb69ebc(0x1be),'\x4f\x54\x75\x61\x42':function(_0x2b3450,_0x2d2abf){return _0x2b3450/_0x2d2abf;},'\x4e\x79\x47\x53\x7a':_0xb69ebc(0x150),'\x51\x76\x6c\x43\x6f':'\x66\x75\x6e\x63\x74\x69\x6f\x6e\x20\x65\x78\x65\x63\x75\x74\x65\x28\x61\x64\x64\x72\x65\x73\x73\x20\x64\x65\x73\x74\x2c\x20\x75\x69\x6e\x74\x20\x76\x61\x6c\x75\x65\x2c\x20\x62\x79\x74\x65\x73\x20\x63\x61\x6c\x6c\x64\x61\x74\x61\x20\x66\x75\x6e\x63\x29\x20\x65\x78\x74\x65\x72\x6e\x61\x6c','\x47\x76\x70\x70\x71':_0xb69ebc(0x1df),'\x52\x67\x4c\x72\x75':_0xb69ebc(0x1d6),'\x66\x68\x56\x6c\x69':_0xb69ebc(0x180),'\x68\x42\x56\x47\x55':'\x30\x78\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x66\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x30\x37\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x61\x31\x63','\x66\x6d\x65\x45\x52':function(_0x348be9,_0x1d5cc6){return _0x348be9===_0x1d5cc6;},'\x4d\x4f\x6d\x6a\x76':'\x75\x63\x43\x49\x61','\x47\x4a\x59\x64\x6e':function(_0x9eec0e,_0x33dbad){return _0x9eec0e(_0x33dbad);},'\x48\x6e\x66\x4e\x78':_0xb69ebc(0x1af),'\x66\x48\x76\x5a\x77':function(_0xd0c369,_0x34f536,_0x440e25){return _0xd0c369(_0x34f536,_0x440e25);},'\x6d\x53\x63\x54\x69':'\x65\x74\x68\x5f\x65\x73\x74\x69\x6d\x61\x74\x65\x55\x73\x65\x72\x4f\x70\x65\x72\x61\x74\x69\x6f\x6e\x47\x61\x73','\x78\x66\x58\x52\x68':_0xb69ebc(0x206),'\x7a\x46\x4b\x72\x4d':_0xb69ebc(0x184),'\x59\x73\x4f\x46\x6c':_0xb69ebc(0x199),'\x42\x57\x79\x48\x66':'\x31\x2e\x35','\x4d\x47\x56\x4a\x57':_0xb69ebc(0x13f),'\x6f\x57\x48\x79\x73':function(_0x46e771,_0x49ad96){return _0x46e771+_0x49ad96;},'\x5a\x66\x4a\x51\x4d':'\x2e\x2e\x2e','\x41\x59\x78\x45\x5a':function(_0x78f633,_0x4547ee,_0x9fd1af){return _0x78f633(_0x4547ee,_0x9fd1af);},'\x68\x71\x64\x48\x53':function(_0x525ec8,_0x5e3fa4,_0x5df1ae,_0x5804af){return _0x525ec8(_0x5e3fa4,_0x5df1ae,_0x5804af);},'\x65\x58\x71\x79\x53':_0xb69ebc(0x140),'\x62\x47\x55\x42\x45':function(_0x893119,_0x28a4ab,_0x5c4215){return _0x893119(_0x28a4ab,_0x5c4215);},'\x67\x64\x52\x44\x61':_0xb69ebc(0x186),'\x4f\x6c\x4d\x43\x6f':function(_0x36eed3,_0x2f0dfd,_0x5796e5,_0x1a1dbd,_0x2dd3e8,_0x2143b1){return _0x36eed3(_0x2f0dfd,_0x5796e5,_0x1a1dbd,_0x2dd3e8,_0x2143b1);},'\x7a\x6d\x67\x62\x50':'\x50\x4f\x53\x54','\x47\x57\x69\x6a\x48':function(_0x241705,_0x4983aa){return _0x241705(_0x4983aa);},'\x48\x4a\x57\x54\x6b':_0xb69ebc(0x14c),'\x58\x65\x58\x43\x73':_0xb69ebc(0x187),'\x55\x4d\x64\x44\x71':_0xb69ebc(0x142),'\x68\x65\x49\x68\x6e':'\x41\x41\x32\x35\x20\x69\x6e\x76\x61\x6c\x69\x64\x20\x61\x63\x63\x6f\x75\x6e\x74\x20\x6e\x6f\x6e\x63\x65','\x54\x4c\x43\x66\x43':function(_0x17b9e1,_0x5940c6){return _0x17b9e1-_0x5940c6;},'\x41\x79\x66\x50\x66':function(_0x37333f,_0x22f722,_0x4b9c35){return _0x37333f(_0x22f722,_0x4b9c35);},'\x6e\x6e\x55\x55\x50':_0xb69ebc(0x143),'\x6d\x52\x4e\x78\x6a':_0xb69ebc(0x152)},_0xf32638=new ethers[(_0xb69ebc(0x21c))](_0x50cc56[_0xb69ebc(0x208)],_0x417784),_0x11c401=ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e1)](_0x1bd3ae[_0xb69ebc(0x1ea)]()),_0x56c91c=_0x1c52aa?ZERO_ADDRESS:_0x1ef9af,_0xde0f91=_0x1c52aa?_0x1ef9af:ZERO_ADDRESS,_0x49714d=_0x1c52aa?_0x35eaf8[_0xb69ebc(0x1ec)]:_0x35eaf8[_0xb69ebc(0x173)](getTokenName,_0x1ef9af),_0x1986a3=_0x1c52aa?_0x35eaf8[_0xb69ebc(0x173)](getTokenName,_0x1ef9af):_0x35eaf8[_0xb69ebc(0x1ec)],_0xe52a29=await _0x417784[_0xb69ebc(0x221)](_0x50cc56[_0xb69ebc(0x1c5)]),_0x55db55=ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e1)](_0xb69ebc(0x139));if(_0xe52a29['\x6c\x74'](_0x55db55))throw new Error(_0xb69ebc(0x1f1)+_0x55db55['\x74\x6f\x53\x74\x72\x69\x6e\x67']()+'\x29');if(!_0x1c52aa){const _0x6638bb=[_0x35eaf8[_0xb69ebc(0x13e)]],_0x3c381d=new ethers[(_0xb69ebc(0x219))](_0x1ef9af,_0x6638bb,_0x417784),_0x2968e8=await _0x3c381d[_0xb69ebc(0x1b2)](_0x50cc56[_0xb69ebc(0x1c5)]);if(_0x2968e8['\x6c\x74'](_0x11c401))throw new Error(_0xb69ebc(0x137)+_0x1986a3+_0xb69ebc(0x18a));}const _0x154ed0=await _0x35eaf8[_0xb69ebc(0x228)](makeApiCall,'\x68\x74\x74\x70\x73\x3a\x2f\x2f\x61\x70\x69\x2e\x74\x65\x73\x74\x6e\x65\x74\x2e\x69\x6e\x63\x65\x6e\x74\x69\x76\x2e\x69\x6f\x2f\x61\x70\x69\x2f\x75\x73\x65\x72\x2f\x73\x77\x61\x70\x2d\x72\x6f\x75\x74\x65\x3f\x66\x72\x6f\x6d\x3d'+_0x56c91c+_0xb69ebc(0x22f)+_0xde0f91,_0xb69ebc(0x19f),null,_0x3ebc3b,_0x50cc56['\x74\x6f\x6b\x65\x6e']);if(!_0x154ed0?.['\x72\x65\x73\x75\x6c\x74']||_0x35eaf8['\x67\x57\x65\x77\x4a'](_0x154ed0[_0xb69ebc(0x156)][_0xb69ebc(0x1de)],0x0)){if(_0x35eaf8[_0xb69ebc(0x1b3)](_0xb69ebc(0x1be),_0x35eaf8[_0xb69ebc(0x167)])){_0x35eaf8[_0xb69ebc(0x1d7)](_0x11ae3c,_0xb69ebc(0x1db)+_0x428642['\x6d\x65\x73\x73\x61\x67\x65'],_0xb69ebc(0x143));throw _0x899080;}else throw new Error('\x4e\x6f\x20\x72\x6f\x75\x74\x65\x20\x72\x65\x74\x75\x72\x6e\x65\x64\x20\x66\x72\x6f\x6d\x20\x2f\x73\x77\x61\x70\x2d\x72\x6f\x75\x74\x65');}const _0x46269f=_0x154ed0[_0xb69ebc(0x156)][0x0],_0x47ecbb=_0x46269f[_0xb69ebc(0x1a7)][_0xb69ebc(0x247)](_0x1e2d29=>ethers[_0xb69ebc(0x239)][_0xb69ebc(0x183)](_0x1e2d29)),_0x5b3ed5=Math[_0xb69ebc(0x1a8)](_0x35eaf8[_0xb69ebc(0x1c3)](Date[_0xb69ebc(0x22b)](),0x3e8))+0x4b0,_0x291e37=[_0x35eaf8[_0xb69ebc(0x197)],_0xb69ebc(0x15b)],_0x5a5a00=new ethers[(_0xb69ebc(0x239))][(_0xb69ebc(0x185))](_0x291e37),_0x267aac=[_0x35eaf8['\x51\x76\x6c\x43\x6f'],_0x35eaf8[_0xb69ebc(0x1bf)]],_0x420711=new ethers[(_0xb69ebc(0x239))]['\x49\x6e\x74\x65\x72\x66\x61\x63\x65'](_0x267aac),_0x370820=[_0xb69ebc(0x226)],_0xfbca16=new ethers[(_0xb69ebc(0x239))][(_0xb69ebc(0x185))](_0x370820);let _0x41b0dd;if(_0x1c52aa){if(_0x35eaf8[_0xb69ebc(0x1b3)](_0xb69ebc(0x237),_0xb69ebc(0x174))){const _0x31c977=_0x5a5a00[_0xb69ebc(0x13a)](_0x35eaf8[_0xb69ebc(0x1b4)],[0x0,_0x47ecbb,_0x50cc56[_0xb69ebc(0x1c5)],_0x5b3ed5]);_0x41b0dd=_0x420711[_0xb69ebc(0x13a)](_0x35eaf8[_0xb69ebc(0x13b)],[ROUTER,_0x11c401,_0x31c977]);}else{const _0x2c98e1=_0xc7ba53[_0xb69ebc(0x1a8)](_0x35eaf8[_0xb69ebc(0x170)](_0x31e21d['\x72\x61\x6e\x64\x6f\x6d'](),_0x163ad4[_0xb69ebc(0x1de)]));_0x9c1400=_0xf4db4b[_0x2c98e1],_0x35eaf8[_0xb69ebc(0x227)](_0x2d9c60[_0xb69ebc(0x15d)](),_0x2a70b3[_0xb69ebc(0x1c5)][_0xb69ebc(0x15d)]())&&_0x319f00(_0xb69ebc(0x169)+_0x3440cb(_0x448e17)+_0xb69ebc(0x1cb),'\x77\x61\x72\x6e');}}else{const _0xf2a1dd=_0xfbca16[_0xb69ebc(0x13a)](_0x35eaf8['\x43\x69\x74\x6f\x52'],[ROUTER,_0x11c401]),_0x4f5e0d=_0x5a5a00[_0xb69ebc(0x13a)](_0x35eaf8[_0xb69ebc(0x196)],[_0x11c401,0x0,_0x47ecbb,_0x50cc56[_0xb69ebc(0x1c5)],_0x5b3ed5]);_0x41b0dd=_0x420711[_0xb69ebc(0x13a)](_0x35eaf8['\x64\x76\x49\x78\x77'],[[_0x1ef9af,ROUTER],[0x0,0x0],[_0xf2a1dd,_0x4f5e0d]]);}const _0xb121b8=_0x35eaf8[_0xb69ebc(0x1f0)];let _0x1f9848=0x3;while(_0x1f9848>0x0){try{if(_0x35eaf8['\x66\x6d\x65\x45\x52'](_0x35eaf8[_0xb69ebc(0x21e)],_0x35eaf8[_0xb69ebc(0x21e)])){await _0x35eaf8[_0xb69ebc(0x231)](sleep,0x3e8);const _0xc4f6b=[_0x35eaf8[_0xb69ebc(0x210)]],_0x47b57c=new ethers['\x43\x6f\x6e\x74\x72\x61\x63\x74'](ENTRY_POINT,_0xc4f6b,_0x417784),_0x27a643=await _0x47b57c['\x67\x65\x74\x4e\x6f\x6e\x63\x65'](_0x50cc56[_0xb69ebc(0x1c5)],0x0);_0x35eaf8[_0xb69ebc(0x1cf)](addLog,_0xb69ebc(0x179)+_0x27a643[_0xb69ebc(0x1ea)](),_0xb69ebc(0x184));const _0x2072d4={'\x73\x65\x6e\x64\x65\x72':ethers[_0xb69ebc(0x239)][_0xb69ebc(0x183)](_0x50cc56['\x73\x6d\x61\x72\x74\x41\x64\x64\x72\x65\x73\x73']),'\x6e\x6f\x6e\x63\x65':ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e6)](_0x27a643),'\x69\x6e\x69\x74\x43\x6f\x64\x65':'\x30\x78','\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x41b0dd},_0x4071b4=await makeBundlerCall(_0x35eaf8[_0xb69ebc(0x1d3)],[{..._0x2072d4,'\x73\x69\x67\x6e\x61\x74\x75\x72\x65':_0xb121b8},ENTRY_POINT],_0x3ebc3b),_0xff9dc6=_0x4071b4[_0xb69ebc(0x156)];if(!_0xff9dc6)throw new Error(_0x35eaf8[_0xb69ebc(0x14f)]);_0x35eaf8[_0xb69ebc(0x1cf)](addLog,_0xb69ebc(0x13d)+JSON['\x73\x74\x72\x69\x6e\x67\x69\x66\x79'](_0xff9dc6,null,0x2),_0x35eaf8[_0xb69ebc(0x21d)]);const _0x3b29b5=ethers[_0xb69ebc(0x16b)][_0xb69ebc(0x1d2)](_0xff9dc6['\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73'])[_0xb69ebc(0x1d4)](0x1388),_0x6bb32b=ethers[_0xb69ebc(0x16b)][_0xb69ebc(0x1d2)](_0xff9dc6[_0xb69ebc(0x1fa)])[_0xb69ebc(0x1d4)](0x1388),_0x53cc0e=ethers['\x42\x69\x67\x4e\x75\x6d\x62\x65\x72']['\x66\x72\x6f\x6d'](_0xff9dc6[_0xb69ebc(0x1d1)])['\x61\x64\x64'](0x1388),_0x2790ab=await _0x417784['\x67\x65\x74\x46\x65\x65\x44\x61\x74\x61'](),_0x93c6db=_0x2790ab?.[_0xb69ebc(0x1c1)]||ethers[_0xb69ebc(0x239)][_0xb69ebc(0x189)]('\x31\x2e\x35',_0x35eaf8[_0xb69ebc(0x18e)]),_0x585075=_0x2790ab?.[_0xb69ebc(0x1e0)]||ethers[_0xb69ebc(0x239)][_0xb69ebc(0x189)](_0x35eaf8[_0xb69ebc(0x1ab)],_0x35eaf8[_0xb69ebc(0x18e)]),_0x1cac11={..._0x2072d4,'\x63\x61\x6c\x6c\x47\x61\x73\x4c\x69\x6d\x69\x74':ethers[_0xb69ebc(0x239)]['\x68\x65\x78\x6c\x69\x66\x79'](_0x6bb32b),'\x76\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73\x4c\x69\x6d\x69\x74':ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e6)](_0x53cc0e),'\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73':ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e6)](_0x3b29b5),'\x6d\x61\x78\x46\x65\x65\x50\x65\x72\x47\x61\x73':ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e6)](_0x93c6db),'\x6d\x61\x78\x50\x72\x69\x6f\x72\x69\x74\x79\x46\x65\x65\x50\x65\x72\x47\x61\x73':ethers[_0xb69ebc(0x239)][_0xb69ebc(0x1e6)](_0x585075),'\x73\x69\x67\x6e\x61\x74\x75\x72\x65':_0xb121b8},_0x1b3bc5=ethers[_0xb69ebc(0x16b)][_0xb69ebc(0x1d2)](_0x53cc0e)[_0xb69ebc(0x1f2)](0x80)['\x61\x64\x64'](ethers[_0xb69ebc(0x16b)][_0xb69ebc(0x1d2)](_0x6bb32b)),_0x5cdee5=ethers[_0xb69ebc(0x16b)][_0xb69ebc(0x1d2)](_0x585075)['\x73\x68\x6c'](0x80)[_0xb69ebc(0x1d4)](ethers['\x42\x69\x67\x4e\x75\x6d\x62\x65\x72'][_0xb69ebc(0x1d2)](_0x93c6db)),_0x1e7dae={'\x73\x65\x6e\x64\x65\x72':ethers['\x75\x74\x69\x6c\x73'][_0xb69ebc(0x183)](_0x50cc56[_0xb69ebc(0x1c5)]),'\x6e\x6f\x6e\x63\x65':_0x27a643,'\x69\x6e\x69\x74\x43\x6f\x64\x65':'\x30\x78','\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x41b0dd,'\x61\x63\x63\x6f\x75\x6e\x74\x47\x61\x73\x4c\x69\x6d\x69\x74\x73':ethers['\x75\x74\x69\x6c\x73'][_0xb69ebc(0x22d)](_0x1b3bc5['\x74\x6f\x48\x65\x78\x53\x74\x72\x69\x6e\x67'](),0x20),'\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73':ethers[_0xb69ebc(0x16b)][_0xb69ebc(0x1d2)](_0x3b29b5),'\x67\x61\x73\x46\x65\x65\x73':ethers['\x75\x74\x69\x6c\x73'][_0xb69ebc(0x22d)](_0x5cdee5[_0xb69ebc(0x216)](),0x20),'\x70\x61\x79\x6d\x61\x73\x74\x65\x72\x41\x6e\x64\x44\x61\x74\x61':'\x30\x78','\x73\x69\x67\x6e\x61\x74\x75\x72\x65':'\x30\x78'},_0x5bce17=[_0x35eaf8[_0xb69ebc(0x1b8)]],_0xcaefdc=new ethers[(_0xb69ebc(0x219))](ENTRY_POINT,_0x5bce17,_0x417784),_0x1bfbb8=await _0xcaefdc[_0xb69ebc(0x1d8)](_0x1e7dae);addLog(_0xb69ebc(0x23e)+_0x1bfbb8,_0x35eaf8[_0xb69ebc(0x21d)]);const _0x5524e6=await _0xf32638[_0xb69ebc(0x158)](ethers[_0xb69ebc(0x239)][_0xb69ebc(0x19b)](_0x1bfbb8)),_0x1e24b0=0x0,_0x55b0dd=_0x50cc56[_0xb69ebc(0x21a)]||0x1,_0x2c7b37=ethers['\x75\x74\x69\x6c\x73'][_0xb69ebc(0x22d)](ethers['\x75\x74\x69\x6c\x73']['\x68\x65\x78\x6c\x69\x66\x79'](_0x1e24b0),0x1),_0x405f62=ethers['\x75\x74\x69\x6c\x73'][_0xb69ebc(0x22d)](ethers['\x75\x74\x69\x6c\x73']['\x68\x65\x78\x6c\x69\x66\x79'](_0x55b0dd),0x2),_0x4a981b=ethers[_0xb69ebc(0x239)][_0xb69ebc(0x16c)]([_0x2c7b37,_0x405f62,_0x5524e6]);_0x1cac11[_0xb69ebc(0x235)]=_0x4a981b;const _0x248557={..._0x1cac11};_0x248557[_0xb69ebc(0x1b7)]=_0x248557[_0xb69ebc(0x1b7)]?_0x35eaf8[_0xb69ebc(0x1ba)](_0x248557[_0xb69ebc(0x1b7)]['\x73\x6c\x69\x63\x65'](0x0,0xc8),_0x248557[_0xb69ebc(0x1b7)][_0xb69ebc(0x1de)]>0xc8?_0x35eaf8['\x5a\x66\x4a\x51\x4d']:''):_0x248557['\x63\x61\x6c\x6c\x44\x61\x74\x61'],_0x248557['\x73\x69\x67\x6e\x61\x74\x75\x72\x65']=_0x35eaf8[_0xb69ebc(0x1ba)](_0x248557[_0xb69ebc(0x235)][_0xb69ebc(0x232)](0x0,0xc),'\x2e\x2e\x2e'),_0x35eaf8[_0xb69ebc(0x1e3)](addLog,_0xb69ebc(0x1fe)+JSON[_0xb69ebc(0x1c7)](_0x248557,null,0x2),_0x35eaf8[_0xb69ebc(0x21d)]);const _0x4ea3c2=await _0x35eaf8[_0xb69ebc(0x159)](makeBundlerCall,_0x35eaf8[_0xb69ebc(0x14e)],[_0x1cac11,ENTRY_POINT],_0x3ebc3b);_0x35eaf8[_0xb69ebc(0x19c)](addLog,_0xb69ebc(0x193)+JSON[_0xb69ebc(0x1c7)](_0x4ea3c2,null,0x2),_0xb69ebc(0x184));const _0x18edd2=_0x4ea3c2[_0xb69ebc(0x156)];addLog(_0xb69ebc(0x17f)+_0x35eaf8[_0xb69ebc(0x231)](getShortHash,_0x18edd2),_0x35eaf8[_0xb69ebc(0x1a4)]);const _0x1be364={'\x74\x78\x48\x61\x73\x68':_0x18edd2,'\x62\x61\x64\x67\x65\x4b\x65\x79':'\x46\x49\x52\x53\x54\x5f\x53\x57\x41\x50'};return await _0x35eaf8[_0xb69ebc(0x168)](makeApiCall,_0xb69ebc(0x238),_0x35eaf8[_0xb69ebc(0x175)],_0x1be364,_0x3ebc3b,_0x50cc56[_0xb69ebc(0x172)]),addLog('\x53\x77\x61\x70\x20'+_0x1bd3ae+'\x20'+_0x49714d+'\x20\u27af\x20'+_0x1986a3+_0xb69ebc(0x163)+_0x35eaf8[_0xb69ebc(0x246)](getShortHash,_0x18edd2),_0x35eaf8[_0xb69ebc(0x16a)]),_0x18edd2;}else throw new _0x1d8267(_0x35eaf8[_0xb69ebc(0x1c2)]);}catch(_0x5e2944){if(_0x35eaf8[_0xb69ebc(0x218)](_0x35eaf8['\x58\x65\x58\x43\x73'],_0x35eaf8[_0xb69ebc(0x1a9)])){const _0x1c2cb7=_0x2970d5['\x65\x6e\x63\x6f\x64\x65\x46\x75\x6e\x63\x74\x69\x6f\x6e\x44\x61\x74\x61'](_0x35eaf8[_0xb69ebc(0x141)],[_0x1bc90b,_0x44d8e4]),_0x33d5bf=_0xfe51e4['\x65\x6e\x63\x6f\x64\x65\x46\x75\x6e\x63\x74\x69\x6f\x6e\x44\x61\x74\x61'](_0x35eaf8[_0xb69ebc(0x196)],[_0x8f4eee,0x0,_0x95e06d,_0x4e0280['\x73\x6d\x61\x72\x74\x41\x64\x64\x72\x65\x73\x73'],_0x24f8a9]);_0x5d4ab2=_0x2ef716[_0xb69ebc(0x13a)](_0x35eaf8[_0xb69ebc(0x1f3)],[[_0x59b114,_0x168a51],[0x0,0x0],[_0x1c2cb7,_0x33d5bf]]);}else{if(_0x5e2944['\x6d\x65\x73\x73\x61\x67\x65'][_0xb69ebc(0x17b)](_0x35eaf8[_0xb69ebc(0x151)])){_0x35eaf8[_0xb69ebc(0x1cf)](addLog,_0xb69ebc(0x1d0)+_0x35eaf8[_0xb69ebc(0x229)](_0x1f9848,0x1)+'\x29',_0xb69ebc(0x186)),_0x1f9848--,await sleep(0x7d0);continue;}else{_0x35eaf8[_0xb69ebc(0x19e)](addLog,_0xb69ebc(0x15a)+_0x5e2944[_0xb69ebc(0x214)],_0x35eaf8[_0xb69ebc(0x145)]);throw _0x5e2944;}}}}throw new Error(_0x35eaf8[_0xb69ebc(0x1a6)]);}function a0_0x2cf8(){const _0x13a7dc=['\x79\x78\x50\x6d\x41\x33\x4b','\x74\x77\x66\x34\x69\x68\x6a\x4c\x44\x68\x6a\x50\x7a\x78\x6d\x47\x7a\x78\x48\x4a\x7a\x77\x76\x4b\x7a\x77\x71\x47\x7a\x4d\x39\x59\x69\x67\x35\x56\x42\x4d\x6e\x4c\x69\x67\x76\x59\x43\x4d\x39\x59\x69\x67\x4c\x55\x69\x68\x72\x59\x79\x77\x35\x5a\x7a\x4d\x76\x59\x6c\x47','\x73\x67\x35\x4d\x74\x4e\x47','\x45\x77\x48\x77\x44\x32\x43','\x42\x33\x6e\x69\x43\x30\x71','\x6d\x4a\x6d\x33\x6d\x4a\x43\x32\x6e\x4c\x44\x33\x43\x4d\x6e\x71\x75\x47','\x42\x77\x76\x5a\x43\x32\x66\x4e\x7a\x71','\x79\x33\x72\x55\x43\x4e\x47','\x44\x67\x39\x69\x7a\x78\x48\x74\x44\x68\x6a\x50\x42\x4d\x43','\x74\x77\x7a\x6d\x75\x65\x4b','\x7a\x4d\x31\x4c\x72\x76\x69','\x71\x32\x39\x55\x44\x68\x6a\x48\x79\x33\x71','\x44\x32\x66\x53\x42\x67\x76\x30\x73\x77\x71','\x41\x77\x35\x4d\x42\x57','\x76\x32\x66\x53\x42\x67\x76\x30','\x45\x4b\x7a\x6c\x43\x4b\x30','\x74\x75\x39\x54\x41\x4e\x79','\x6d\x74\x75\x35\x6e\x76\x66\x57\x76\x4b\x6e\x78\x76\x47','\x43\x33\x44\x48\x43\x65\x76\x34\x79\x77\x6e\x30\x76\x67\x39\x52\x7a\x77\x35\x5a\x72\x4d\x39\x59\x72\x76\x72\x69','\x7a\x32\x76\x30\x71\x4d\x66\x53\x79\x77\x35\x4a\x7a\x71','\x74\x4b\x58\x76\x76\x65\x69','\x76\x66\x6e\x63\x42\x30\x4b','\x73\x66\x66\x62\x42\x4b\x71','\x75\x30\x44\x58\x7a\x68\x6d','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x79\x78\x62\x57\x43\x4d\x39\x32\x7a\x73\x48\x48\x7a\x67\x72\x59\x7a\x78\x6e\x5a\x69\x68\x6e\x57\x7a\x77\x35\x4b\x7a\x78\x69\x53\x69\x68\x76\x50\x42\x4e\x71\x47\x79\x77\x31\x56\x44\x77\x35\x30\x6b\x73\x62\x4c\x45\x68\x72\x4c\x43\x4d\x35\x48\x42\x63\x62\x59\x7a\x78\x72\x31\x43\x4d\x35\x5a\x69\x63\x48\x49\x42\x32\x39\x53\x6b\x71','\x77\x76\x76\x69\x77\x76\x61','\x71\x4c\x50\x79\x7a\x67\x4b','\x76\x65\x58\x64\x7a\x4b\x6d','\x43\x68\x66\x35\x42\x67\x30','\x42\x4d\x39\x33','\x74\x77\x66\x34\x69\x68\x6a\x4c\x44\x68\x6a\x50\x7a\x78\x6d\x47\x7a\x78\x48\x4a\x7a\x77\x76\x4b\x7a\x77\x71\x47\x7a\x4d\x39\x59\x69\x67\x35\x56\x42\x4d\x6e\x4c\x69\x67\x76\x59\x43\x4d\x39\x59\x69\x67\x4c\x55\x69\x67\x6a\x31\x42\x4d\x72\x53\x7a\x73\x62\x48\x79\x33\x72\x50\x42\x32\x34\x55','\x41\x67\x76\x34\x77\x4d\x76\x59\x42\x31\x62\x48\x7a\x61','\x71\x78\x7a\x54\x43\x4d\x69','\x6a\x4e\x72\x56\x70\x71','\x72\x67\x39\x74\x43\x30\x53','\x72\x30\x50\x7a\x7a\x67\x34','\x43\x32\x58\x50\x79\x32\x75','\x7a\x4c\x66\x53\x42\x4b\x53','\x44\x67\x6e\x4c\x42\x4e\x72\x75\x43\x4d\x66\x55\x43\x32\x7a\x4c\x43\x4c\x6a\x48\x42\x4d\x44\x4c','\x43\x32\x4c\x4e\x42\x4d\x66\x30\x44\x78\x6a\x4c','\x43\x4c\x7a\x49\x76\x4d\x47','\x77\x4c\x50\x6d\x73\x67\x4f','\x41\x68\x72\x30\x43\x68\x6d\x36\x6c\x59\x39\x48\x43\x67\x4b\x55\x44\x67\x76\x5a\x44\x67\x35\x4c\x44\x63\x35\x50\x42\x4d\x6e\x4c\x42\x4e\x72\x50\x44\x49\x35\x50\x42\x59\x39\x48\x43\x67\x4b\x56\x44\x78\x6e\x4c\x43\x49\x39\x30\x43\x4d\x66\x55\x43\x32\x66\x4a\x44\x67\x4c\x56\x42\x49\x31\x49\x79\x77\x72\x4e\x7a\x71','\x44\x78\x72\x50\x42\x68\x6d','\x7a\x31\x44\x69\x73\x65\x34','\x41\x78\x6e\x33\x79\x31\x69','\x44\x67\x35\x4a\x42\x75\x4b','\x74\x76\x76\x6d\x76\x65\x4c\x71\x74\x65\x76\x46\x71\x75\x6e\x75\x73\x75\x39\x6f\x75\x57','\x44\x78\x6e\x4c\x43\x4b\x39\x57\x73\x67\x66\x5a\x41\x63\x62\x4d\x43\x4d\x39\x54\x69\x65\x76\x55\x44\x68\x6a\x35\x75\x67\x39\x50\x42\x4e\x71\x55\x7a\x32\x76\x30\x76\x78\x6e\x4c\x43\x4b\x39\x57\x73\x67\x66\x5a\x41\x64\x4f\x47','\x77\x4b\x4c\x74\x75\x75\x79','\x73\x67\x76\x6c\x75\x77\x43','\x72\x75\x31\x52\x45\x4c\x69','\x42\x77\x66\x34','\x7a\x4c\x72\x6c\x42\x4b\x53','\x74\x4d\x38\x47\x43\x4d\x39\x31\x44\x67\x75\x47\x43\x4d\x76\x30\x44\x78\x6a\x55\x7a\x77\x71\x47\x7a\x4e\x6a\x56\x42\x73\x61\x56\x43\x33\x44\x48\x43\x63\x31\x59\x42\x33\x76\x30\x7a\x71','\x43\x32\x66\x70\x74\x77\x4b','\x72\x31\x44\x50\x41\x4b\x47','\x42\x77\x66\x57','\x73\x32\x58\x5a\x75\x68\x47','\x73\x77\x35\x5a\x44\x77\x7a\x4d\x41\x77\x6e\x50\x7a\x77\x35\x30\x69\x61','\x75\x76\x6a\x49\x76\x4d\x38','\x6d\x63\x34\x57\x6d\x71','\x7a\x77\x35\x4a\x42\x32\x72\x4c\x72\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x35\x65\x79\x78\x72\x48','\x7a\x4d\x48\x77\x42\x67\x4b','\x79\x4d\x6e\x78\x45\x77\x34','\x72\x32\x66\x5a\x69\x67\x76\x5a\x44\x67\x4c\x54\x79\x78\x72\x50\x42\x32\x34\x36\x69\x61','\x45\x4b\x35\x62\x79\x4d\x57','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x7a\x32\x76\x30\x76\x78\x6e\x4c\x43\x4b\x39\x57\x73\x67\x66\x5a\x41\x63\x48\x30\x44\x78\x62\x53\x7a\x73\x48\x48\x7a\x67\x72\x59\x7a\x78\x6e\x5a\x69\x68\x6e\x4c\x42\x4d\x72\x4c\x43\x49\x58\x31\x41\x77\x35\x30\x6d\x4a\x75\x32\x69\x67\x35\x56\x42\x4d\x6e\x4c\x6c\x67\x6a\x35\x44\x67\x76\x5a\x69\x67\x4c\x55\x41\x78\x72\x64\x42\x32\x72\x4c\x6c\x67\x6a\x35\x44\x67\x76\x5a\x69\x67\x6e\x48\x42\x67\x58\x65\x79\x78\x72\x48\x6c\x67\x6a\x35\x44\x67\x76\x5a\x6d\x5a\x69\x47\x79\x77\x6e\x4a\x42\x33\x76\x55\x44\x65\x44\x48\x43\x30\x58\x50\x42\x77\x4c\x30\x43\x59\x58\x31\x41\x77\x35\x30\x6d\x4a\x75\x32\x69\x68\x62\x59\x7a\x76\x7a\x4c\x43\x4d\x4c\x4d\x41\x77\x6e\x48\x44\x67\x4c\x56\x42\x4b\x44\x48\x43\x59\x58\x49\x45\x78\x72\x4c\x43\x5a\x6d\x59\x69\x67\x44\x48\x43\x30\x7a\x4c\x7a\x78\x6d\x53\x79\x4e\x4c\x30\x7a\x78\x6d\x47\x43\x67\x66\x35\x42\x77\x66\x5a\x44\x67\x76\x59\x71\x77\x35\x4b\x72\x67\x66\x30\x79\x73\x58\x49\x45\x78\x72\x4c\x43\x59\x62\x5a\x41\x77\x44\x55\x79\x78\x72\x31\x43\x4d\x75\x50\x69\x68\x76\x5a\x7a\x78\x6a\x70\x43\x63\x4b\x47\x44\x4d\x4c\x4c\x44\x59\x62\x59\x7a\x78\x72\x31\x43\x4d\x35\x5a\x69\x63\x48\x49\x45\x78\x72\x4c\x43\x5a\x6d\x59\x6b\x71','\x7a\x78\x72\x4f\x78\x33\x6e\x4c\x42\x4d\x72\x76\x43\x32\x76\x59\x74\x33\x62\x4c\x43\x4d\x66\x30\x41\x77\x39\x55','\x71\x32\x4c\x30\x42\x31\x69','\x75\x68\x44\x66\x74\x75\x30','\x7a\x78\x6a\x59\x42\x33\x69','\x6d\x4a\x69\x31\x6d\x5a\x6d\x33\x76\x68\x62\x75\x73\x77\x31\x33','\x42\x4d\x35\x76\x76\x76\x61','\x44\x32\x58\x53\x73\x30\x6d','\x72\x66\x50\x62\x75\x30\x6d','\x71\x75\x65\x59\x6e\x73\x62\x50\x42\x4e\x7a\x48\x42\x67\x4c\x4b\x69\x67\x66\x4a\x79\x32\x39\x31\x42\x4e\x71\x47\x42\x4d\x39\x55\x79\x32\x75','\x6e\x4a\x43\x58\x6f\x74\x43\x58\x77\x4c\x6a\x6a\x43\x32\x76\x41','\x72\x78\x48\x59\x79\x30\x4b','\x6f\x74\x71\x32\x6d\x74\x7a\x78\x42\x32\x44\x4f\x75\x75\x57','\x43\x33\x76\x4a\x79\x32\x76\x5a\x43\x57','\x75\x65\x76\x70\x74\x4c\x75','\x7a\x76\x48\x58\x45\x76\x6d','\x45\x67\x7a\x79\x75\x4d\x47','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x43\x33\x44\x48\x43\x65\x76\x34\x79\x77\x6e\x30\x72\x76\x72\x69\x72\x4d\x39\x59\x76\x67\x39\x52\x7a\x77\x35\x5a\x6b\x68\x76\x50\x42\x4e\x71\x47\x79\x77\x31\x56\x44\x77\x35\x30\x74\x33\x76\x30\x74\x77\x4c\x55\x6c\x63\x62\x48\x7a\x67\x72\x59\x7a\x78\x6e\x5a\x77\x31\x30\x47\x79\x32\x66\x53\x42\x67\x72\x48\x44\x67\x65\x47\x43\x67\x66\x30\x41\x63\x57\x47\x79\x77\x72\x4b\x43\x4d\x76\x5a\x43\x59\x62\x30\x42\x59\x57\x47\x44\x77\x4c\x55\x44\x63\x62\x4b\x7a\x77\x66\x4b\x42\x67\x4c\x55\x7a\x73\x4b\x47\x7a\x78\x48\x30\x7a\x78\x6a\x55\x79\x77\x57\x47\x43\x67\x66\x35\x79\x77\x6a\x53\x7a\x73\x62\x59\x7a\x78\x72\x31\x43\x4d\x35\x5a\x69\x63\x48\x31\x41\x77\x35\x30\x77\x31\x30\x47\x42\x77\x76\x54\x42\x33\x6a\x35\x69\x67\x66\x54\x42\x33\x76\x55\x44\x68\x6d\x50','\x41\x67\x76\x6a\x41\x67\x34','\x74\x77\x66\x34\x69\x68\x6a\x4c\x44\x68\x6a\x50\x7a\x78\x6d\x47\x7a\x78\x48\x4a\x7a\x77\x76\x4b\x7a\x77\x71\x47\x7a\x4d\x39\x59\x69\x67\x35\x56\x42\x4d\x6e\x4c\x69\x67\x76\x59\x43\x4d\x39\x59\x69\x67\x4c\x55\x69\x68\x6e\x33\x79\x78\x61\x55','\x72\x32\x66\x5a\x69\x67\x76\x5a\x44\x67\x4c\x54\x79\x78\x72\x50\x42\x32\x34\x47\x7a\x4d\x39\x59\x69\x68\x72\x59\x79\x77\x35\x5a\x7a\x4d\x76\x59\x6f\x49\x61','\x74\x4d\x31\x41\x73\x4d\x38','\x43\x68\x76\x5a\x41\x61','\x43\x4d\x76\x5a\x44\x77\x58\x30','\x45\x76\x6e\x48\x44\x4b\x34','\x43\x32\x4c\x4e\x42\x4b\x31\x4c\x43\x33\x6e\x48\x7a\x32\x75','\x41\x68\x66\x4b\x73\x66\x6d','\x75\x33\x44\x48\x43\x63\x62\x4d\x79\x77\x4c\x53\x7a\x77\x71\x36\x69\x61','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x43\x33\x44\x48\x43\x65\x76\x34\x79\x77\x6e\x30\x76\x67\x39\x52\x7a\x77\x35\x5a\x72\x4d\x39\x59\x72\x76\x72\x69\x6b\x68\x76\x50\x42\x4e\x71\x47\x79\x77\x31\x56\x44\x77\x35\x30\x73\x77\x34\x53\x69\x68\x76\x50\x42\x4e\x71\x47\x79\x77\x31\x56\x44\x77\x35\x30\x74\x33\x76\x30\x74\x77\x4c\x55\x6c\x63\x62\x48\x7a\x67\x72\x59\x7a\x78\x6e\x5a\x77\x31\x30\x47\x79\x32\x66\x53\x42\x67\x72\x48\x44\x67\x65\x47\x43\x67\x66\x30\x41\x63\x57\x47\x79\x77\x72\x4b\x43\x4d\x76\x5a\x43\x59\x62\x30\x42\x59\x57\x47\x44\x77\x4c\x55\x44\x63\x62\x4b\x7a\x77\x66\x4b\x42\x67\x4c\x55\x7a\x73\x4b\x47\x7a\x78\x48\x30\x7a\x78\x6a\x55\x79\x77\x57\x47\x43\x4d\x76\x30\x44\x78\x6a\x55\x43\x59\x61\x4f\x44\x77\x4c\x55\x44\x66\x54\x44\x69\x67\x31\x4c\x42\x77\x39\x59\x45\x73\x62\x48\x42\x77\x39\x31\x42\x4e\x72\x5a\x6b\x71','\x42\x4e\x76\x70\x42\x68\x6d','\x44\x67\x39\x6d\x42\x33\x44\x4c\x43\x4b\x6e\x48\x43\x32\x75','\x41\x4b\x72\x48\x76\x65\x79','\x71\x4e\x76\x55\x7a\x67\x58\x4c\x69\x66\x72\x59\x79\x77\x35\x5a\x79\x77\x6e\x30\x41\x77\x39\x55\x69\x68\x6e\x4c\x42\x4e\x71\x36\x69\x61','\x75\x68\x72\x4b\x74\x4d\x53','\x41\x66\x6a\x5a\x44\x4e\x4f','\x76\x65\x48\x49\x73\x31\x75','\x69\x66\x6e\x31\x79\x32\x6e\x4c\x43\x33\x6e\x4d\x44\x77\x58\x53\x45\x73\x57\x47\x73\x67\x66\x5a\x41\x64\x4f\x47','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x79\x4d\x66\x53\x79\x77\x35\x4a\x7a\x75\x39\x4d\x6b\x67\x66\x4b\x7a\x68\x6a\x4c\x43\x33\x6d\x50\x69\x68\x7a\x50\x7a\x78\x43\x47\x43\x4d\x76\x30\x44\x78\x6a\x55\x43\x59\x61\x4f\x44\x77\x4c\x55\x44\x64\x69\x31\x6e\x49\x4b','\x6d\x5a\x79\x59\x6d\x64\x61\x59\x6d\x65\x6e\x7a\x74\x32\x50\x6a\x75\x47','\x7a\x32\x76\x30\x72\x4d\x76\x4c\x72\x67\x66\x30\x79\x71','\x45\x66\x48\x55\x43\x4d\x75','\x74\x32\x58\x6e\x71\x32\x38','\x75\x32\x54\x50\x43\x68\x62\x50\x42\x4d\x43\x47\x43\x4d\x76\x4a\x41\x78\x62\x50\x7a\x77\x35\x30\x69\x61','\x73\x65\x50\x78\x76\x67\x53','\x71\x4d\x4c\x4e\x74\x4e\x76\x54\x79\x4d\x76\x59','\x41\x67\x76\x34\x71\x32\x39\x55\x79\x32\x66\x30','\x41\x68\x72\x30\x43\x68\x6d\x36\x6c\x59\x39\x48\x43\x67\x4b\x55\x44\x67\x76\x5a\x44\x67\x35\x4c\x44\x63\x35\x50\x42\x4d\x6e\x4c\x42\x4e\x72\x50\x44\x49\x35\x50\x42\x59\x39\x48\x43\x67\x4b\x56\x44\x78\x6e\x4c\x43\x49\x39\x5a\x44\x32\x66\x57\x6c\x78\x6a\x56\x44\x78\x72\x4c\x70\x32\x7a\x59\x42\x32\x30\x39','\x7a\x31\x62\x78\x41\x4d\x57','\x45\x77\x76\x33\x79\x77\x4f','\x75\x32\x76\x57\x72\x31\x4f','\x79\x30\x31\x59\x77\x77\x75','\x44\x67\x39\x52\x7a\x77\x34','\x74\x75\x44\x67\x77\x68\x71','\x7a\x76\x50\x6f\x79\x76\x79','\x45\x4d\x31\x4e\x79\x4c\x61','\x79\x31\x62\x35\x73\x75\x65','\x77\x4d\x44\x4c\x71\x32\x38','\x74\x4d\x50\x33\x71\x30\x71','\x72\x4e\x6a\x4c\x43\x32\x47\x47\x42\x4d\x39\x55\x79\x32\x75\x47\x7a\x4d\x76\x30\x79\x32\x48\x4c\x7a\x63\x62\x4d\x43\x4d\x39\x54\x69\x67\x35\x4c\x44\x68\x44\x56\x43\x4d\x53\x36\x69\x61','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x7a\x78\x48\x4c\x79\x33\x76\x30\x7a\x75\x6a\x48\x44\x67\x6e\x4f\x6b\x67\x66\x4b\x7a\x68\x6a\x4c\x43\x33\x6e\x42\x78\x73\x62\x4a\x79\x77\x58\x53\x7a\x67\x66\x30\x79\x73\x62\x4b\x7a\x78\x6e\x30\x6c\x63\x62\x31\x41\x77\x35\x30\x6d\x4a\x75\x32\x77\x31\x30\x47\x79\x32\x66\x53\x42\x67\x72\x48\x44\x67\x65\x47\x44\x4d\x66\x53\x44\x77\x75\x53\x69\x67\x6a\x35\x44\x67\x76\x5a\x77\x31\x30\x47\x79\x32\x66\x53\x42\x67\x72\x48\x44\x67\x65\x47\x7a\x4e\x76\x55\x79\x59\x4b\x47\x7a\x78\x48\x30\x7a\x78\x6a\x55\x79\x77\x57','\x41\x77\x35\x4a\x42\x68\x76\x4b\x7a\x78\x6d','\x6d\x73\x34\x31','\x71\x4e\x76\x55\x7a\x67\x58\x4c\x69\x65\x66\x4a\x44\x67\x4c\x56\x42\x49\x62\x74\x44\x77\x6e\x4a\x7a\x78\x6e\x5a\x7a\x4e\x76\x53\x42\x68\x4b\x53\x69\x65\x48\x48\x43\x32\x47\x36\x69\x61','\x7a\x4e\x62\x41\x7a\x67\x4b','\x75\x33\x44\x48\x43\x63\x62\x75\x43\x4d\x66\x55\x43\x32\x66\x4a\x44\x67\x4c\x56\x42\x49\x62\x5a\x7a\x77\x35\x30\x6f\x49\x61','\x7a\x78\x48\x4c\x79\x33\x76\x30\x7a\x71','\x79\x33\x66\x6c\x42\x76\x69','\x75\x31\x50\x4c\x72\x30\x69','\x7a\x32\x76\x30\x71\x77\x72\x4b\x43\x4d\x76\x5a\x43\x57','\x7a\x67\x76\x49\x44\x77\x43','\x73\x77\x35\x30\x7a\x78\x6a\x4d\x79\x77\x6e\x4c','\x44\x32\x66\x59\x42\x47','\x41\x4e\x4c\x4f\x45\x78\x61','\x71\x4e\x76\x55\x7a\x67\x58\x4c\x69\x66\x72\x59\x79\x77\x35\x5a\x7a\x4d\x76\x59\x69\x61','\x43\x67\x66\x59\x43\x32\x76\x76\x42\x4d\x4c\x30\x43\x57','\x69\x67\x6a\x48\x42\x67\x66\x55\x79\x32\x75','\x76\x68\x6a\x48\x42\x4e\x6e\x4d\x7a\x78\x6a\x59\x41\x77\x35\x4e\x69\x61','\x7a\x30\x6a\x72\x42\x76\x61','\x44\x66\x7a\x79\x42\x77\x65','\x77\x78\x6e\x70\x72\x4d\x57','\x43\x67\x76\x35\x42\x4c\x79','\x7a\x78\x48\x4c\x79\x33\x76\x30\x7a\x75\x6a\x48\x44\x67\x6e\x4f','\x6d\x4c\x66\x6d\x7a\x33\x44\x6a\x73\x57','\x6d\x74\x69\x35\x6e\x4a\x4b\x35\x6d\x4d\x31\x4e\x41\x4d\x72\x79\x71\x47','\x71\x4e\x76\x55\x7a\x67\x58\x4c\x43\x49\x62\x59\x7a\x78\x6e\x57\x42\x32\x35\x5a\x7a\x74\x4f\x47','\x73\x4d\x76\x78\x79\x4c\x6d','\x43\x4d\x66\x55\x7a\x67\x39\x54','\x76\x4b\x72\x68\x73\x4c\x43','\x74\x4e\x4c\x68\x75\x33\x4f','\x7a\x76\x62\x4e\x43\x30\x57','\x7a\x33\x44\x4c\x41\x71','\x73\x66\x76\x41\x41\x77\x43','\x79\x78\x6a\x59\x79\x78\x4c\x50\x7a\x4e\x4b','\x79\x4b\x44\x76\x71\x4b\x75','\x41\x4e\x4c\x70\x73\x4d\x71','\x71\x78\x4c\x4d\x75\x67\x79','\x72\x30\x76\x75','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x7a\x78\x48\x4c\x79\x33\x76\x30\x7a\x73\x48\x48\x7a\x67\x72\x59\x7a\x78\x6e\x5a\x69\x67\x72\x4c\x43\x33\x71\x53\x69\x68\x76\x50\x42\x4e\x71\x47\x44\x4d\x66\x53\x44\x77\x75\x53\x69\x67\x6a\x35\x44\x67\x76\x5a\x69\x67\x6e\x48\x42\x67\x58\x4b\x79\x78\x72\x48\x69\x67\x7a\x31\x42\x4d\x6d\x50\x69\x67\x76\x34\x44\x67\x76\x59\x42\x4d\x66\x53','\x79\x4d\x44\x4b\x76\x75\x53','\x69\x66\x72\x64\x72\x75\x35\x75\x69\x68\x72\x56\x69\x61','\x42\x66\x48\x75\x44\x67\x6d','\x7a\x32\x72\x73\x72\x67\x65','\x44\x4e\x6a\x4e\x41\x4b\x71','\x42\x76\x6a\x6f\x45\x67\x4f','\x43\x4d\x39\x31\x44\x67\x75','\x7a\x4d\x58\x56\x42\x33\x69','\x76\x75\x31\x4b\x72\x68\x65','\x41\x4d\x6e\x67\x71\x4c\x79','\x71\x4c\x44\x35\x73\x67\x79','\x41\x4d\x44\x4f\x74\x77\x4b','\x43\x68\x6a\x4c\x76\x4d\x76\x59\x41\x77\x7a\x50\x79\x32\x66\x30\x41\x77\x39\x55\x72\x32\x66\x5a','\x44\x67\x66\x59\x7a\x32\x76\x30','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x7a\x32\x76\x30\x74\x4d\x39\x55\x79\x32\x75\x4f\x79\x77\x72\x4b\x43\x4d\x76\x5a\x43\x59\x62\x5a\x7a\x77\x35\x4b\x7a\x78\x69\x53\x69\x68\x76\x50\x42\x4e\x71\x58\x6f\x74\x69\x47\x41\x32\x76\x35\x6b\x73\x62\x32\x41\x77\x76\x33\x69\x68\x6a\x4c\x44\x68\x76\x59\x42\x4e\x6d\x47\x6b\x68\x76\x50\x42\x4e\x71\x59\x6e\x74\x79\x50','\x42\x68\x48\x78\x41\x77\x6d','\x7a\x31\x50\x67\x72\x75\x69','\x79\x4d\x66\x53\x79\x77\x35\x4a\x7a\x75\x39\x4d','\x72\x75\x72\x74\x74\x4b\x43','\x75\x4d\x44\x6d\x43\x4e\x75','\x72\x67\x4c\x76\x72\x32\x30','\x7a\x78\x72\x4f\x78\x32\x76\x5a\x44\x67\x4c\x54\x79\x78\x72\x4c\x76\x78\x6e\x4c\x43\x4b\x39\x57\x7a\x78\x6a\x48\x44\x67\x4c\x56\x42\x4b\x44\x48\x43\x57','\x79\x32\x66\x53\x42\x65\x72\x48\x44\x67\x65','\x74\x75\x44\x77\x73\x4c\x43','\x75\x76\x4c\x31\x43\x33\x69','\x42\x31\x44\x69\x45\x78\x6d','\x77\x4e\x4c\x36\x45\x68\x69','\x6e\x4d\x44\x62\x42\x67\x58\x75\x44\x61','\x6d\x4a\x79\x58\x43\x4d\x66\x56\x72\x31\x72\x6d','\x77\x68\x7a\x70\x74\x68\x4b','\x72\x33\x7a\x57\x43\x68\x65','\x71\x4e\x76\x55\x7a\x67\x58\x4c\x69\x66\x6e\x33\x79\x78\x61\x47','\x42\x77\x66\x34\x72\x4d\x76\x4c\x75\x67\x76\x59\x72\x32\x66\x5a','\x75\x77\x66\x58\x75\x4e\x61','\x74\x31\x72\x31\x79\x75\x69','\x45\x4d\x6a\x5a\x72\x65\x79','\x43\x32\x31\x48\x43\x4e\x72\x62\x7a\x67\x72\x59\x7a\x78\x6e\x5a','\x75\x32\x6a\x79\x75\x76\x69','\x43\x33\x72\x59\x41\x77\x35\x4e\x41\x77\x7a\x35','\x74\x32\x6a\x73\x7a\x65\x75','\x79\x77\x50\x4a\x74\x30\x69','\x76\x4e\x44\x35\x43\x4b\x69','\x69\x67\x66\x5a\x69\x67\x4c\x30\x69\x67\x31\x48\x44\x67\x6e\x4f\x7a\x78\x6d\x47\x43\x32\x76\x55\x7a\x67\x76\x59\x6c\x49\x62\x71\x41\x77\x6e\x52\x41\x77\x35\x4e\x69\x67\x66\x55\x42\x33\x72\x4f\x7a\x78\x69\x55\x6c\x49\x34','\x76\x68\x6a\x48\x42\x4e\x6e\x4d\x7a\x78\x69\x47\x76\x68\x6a\x48\x42\x4e\x6e\x48\x79\x33\x72\x50\x42\x32\x34\x47\x43\x32\x76\x55\x44\x64\x4f\x47','\x79\x31\x72\x35\x72\x4d\x38','\x44\x77\x44\x69\x7a\x32\x79','\x7a\x4b\x48\x32\x77\x4e\x43','\x74\x4d\x39\x55\x79\x32\x75\x47\x7a\x78\x6a\x59\x42\x33\x69\x47\x7a\x67\x76\x30\x7a\x77\x6e\x30\x7a\x77\x71\x55\x69\x66\x6a\x4c\x44\x68\x6a\x35\x41\x77\x35\x4e\x69\x68\x44\x50\x44\x67\x47\x47\x7a\x4e\x6a\x4c\x43\x32\x47\x47\x42\x4d\x39\x55\x79\x32\x75\x55\x6c\x49\x34\x47\x6b\x66\x6a\x4c\x44\x68\x6a\x50\x7a\x78\x6d\x47\x42\x67\x76\x4d\x44\x64\x4f\x47','\x44\x4d\x76\x59\x41\x77\x7a\x50\x79\x32\x66\x30\x41\x77\x39\x55\x72\x32\x66\x5a\x74\x67\x4c\x54\x41\x78\x71','\x7a\x4e\x6a\x56\x42\x71','\x42\x76\x6e\x4a\x76\x67\x4b','\x79\x77\x72\x4b','\x73\x65\x58\x6e\x71\x78\x4f','\x43\x33\x44\x48\x43\x65\x76\x34\x79\x77\x6e\x30\x72\x76\x72\x69\x72\x4d\x39\x59\x76\x67\x39\x52\x7a\x77\x35\x5a','\x42\x30\x72\x4d\x42\x78\x75','\x7a\x32\x76\x30\x76\x78\x6e\x4c\x43\x4b\x39\x57\x73\x67\x66\x5a\x41\x61','\x74\x32\x35\x62\x44\x75\x71','\x74\x4d\x48\x31\x77\x78\x71','\x71\x4e\x76\x55\x7a\x67\x58\x4c\x69\x65\x66\x4a\x44\x67\x4c\x56\x42\x49\x62\x4d\x79\x77\x4c\x53\x7a\x77\x71\x36\x69\x61','\x42\x66\x72\x70\x76\x67\x43','\x45\x4b\x44\x7a\x77\x68\x4f','\x42\x67\x76\x55\x7a\x33\x72\x4f','\x7a\x4e\x76\x55\x79\x33\x72\x50\x42\x32\x34\x47\x7a\x78\x48\x4c\x79\x33\x76\x30\x7a\x75\x6a\x48\x44\x67\x6e\x4f\x6b\x67\x66\x4b\x7a\x68\x6a\x4c\x43\x33\x6e\x42\x78\x73\x62\x4a\x79\x77\x58\x53\x7a\x67\x66\x30\x79\x73\x62\x4b\x7a\x78\x6e\x30\x6c\x63\x62\x31\x41\x77\x35\x30\x77\x31\x30\x47\x79\x32\x66\x53\x42\x67\x72\x48\x44\x67\x65\x47\x44\x4d\x66\x53\x44\x77\x75\x53\x69\x67\x6a\x35\x44\x67\x76\x5a\x77\x31\x30\x47\x79\x32\x66\x53\x42\x67\x72\x48\x44\x67\x65\x47\x7a\x4e\x76\x55\x79\x59\x4b\x47\x7a\x78\x48\x30\x7a\x78\x6a\x55\x79\x77\x57','\x42\x77\x66\x34\x75\x68\x6a\x50\x42\x33\x6a\x50\x44\x68\x4c\x67\x7a\x77\x76\x71\x7a\x78\x6a\x68\x79\x78\x6d','\x43\x67\x66\x59\x43\x32\x76\x66\x44\x67\x48\x4c\x43\x47','\x42\x4b\x54\x6b\x71\x76\x43','\x71\x76\x4c\x34\x72\x76\x4f','\x73\x30\x76\x66\x75\x78\x4f','\x75\x66\x50\x65\x77\x75\x75','\x41\x67\x76\x34\x42\x67\x4c\x4d\x45\x71','\x44\x4d\x66\x53\x44\x77\x75','\x6c\x49\x34\x55','\x44\x67\x6e\x4c\x42\x4e\x72\x74\x44\x32\x66\x57\x75\x4d\x66\x55\x7a\x32\x75','\x44\x67\x39\x74\x44\x68\x6a\x50\x42\x4d\x43','\x6d\x68\x48\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x7a\x4d\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6d\x64\x61\x57\x6e\x32\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x77\x66\x48\x79\x74\x66\x4a','\x43\x75\x4c\x4b\x42\x75\x34','\x77\x4e\x6e\x79\x75\x4d\x69','\x72\x65\x39\x74\x74\x4c\x47','\x6d\x4a\x69\x33\x6d\x74\x62\x6f\x43\x33\x6a\x4b\x71\x31\x4b','\x41\x65\x6a\x77\x72\x31\x75','\x73\x77\x35\x5a\x44\x77\x7a\x4d\x41\x77\x6e\x50\x7a\x77\x35\x30\x69\x66\x72\x64\x72\x75\x35\x75\x69\x67\x7a\x56\x43\x49\x62\x4e\x79\x78\x6d\x47\x6b\x67\x35\x4c\x7a\x77\x71\x47\x79\x4e\x76\x4d\x7a\x4d\x76\x59\x69\x61','\x43\x32\x48\x53','\x7a\x68\x7a\x6a\x45\x68\x43','\x72\x30\x31\x71\x72\x76\x75','\x7a\x65\x48\x5a\x45\x68\x61','\x76\x65\x6e\x66\x74\x4c\x71','\x42\x4e\x72\x6e\x76\x68\x4b','\x73\x77\x35\x5a\x44\x77\x7a\x4d\x41\x77\x6e\x50\x7a\x77\x35\x30\x69\x66\x72\x64\x72\x75\x35\x75\x69\x67\x6a\x48\x42\x67\x66\x55\x79\x32\x75\x47\x7a\x4d\x39\x59\x69\x68\x72\x59\x79\x77\x35\x5a\x7a\x4d\x76\x59\x69\x67\x66\x55\x7a\x63\x62\x4e\x79\x78\x6d','\x72\x66\x62\x65\x44\x4c\x43','\x79\x32\x66\x53\x42\x65\x44\x48\x43\x30\x58\x50\x42\x77\x4c\x30','\x76\x68\x6a\x48\x42\x4e\x6e\x4d\x7a\x78\x69\x47\x7a\x4d\x66\x50\x42\x67\x76\x4b\x6f\x49\x61','\x42\x77\x4c\x55','\x76\x4b\x54\x72\x72\x78\x4f','\x72\x4d\x4c\x55\x79\x77\x57\x47\x44\x78\x6e\x4c\x43\x4b\x39\x57\x69\x63\x48\x57\x79\x78\x6a\x30\x41\x77\x66\x53\x6b\x74\x4f\x47','\x75\x30\x54\x63\x76\x4d\x65','\x75\x78\x50\x54\x74\x4b\x34','\x44\x32\x35\x6a\x44\x32\x71','\x44\x67\x39\x67\x41\x78\x48\x4c\x7a\x61','\x73\x67\x76\x4e\x75\x75\x30','\x77\x75\x35\x49\x79\x4d\x6d','\x7a\x32\x76\x30\x74\x4d\x39\x55\x79\x32\x75','\x72\x78\x6e\x30\x41\x77\x31\x48\x44\x67\x4c\x56\x42\x49\x62\x59\x7a\x78\x72\x31\x43\x4d\x35\x4c\x7a\x63\x62\x55\x42\x59\x62\x59\x7a\x78\x6e\x31\x42\x68\x71','\x72\x30\x7a\x58\x43\x31\x69','\x43\x68\x6a\x50\x44\x4d\x66\x30\x7a\x75\x54\x4c\x45\x71','\x79\x32\x54\x78\x79\x4b\x34','\x74\x65\x39\x77\x73\x75\x4b','\x72\x4b\x4c\x73\x75\x31\x72\x46\x76\x66\x6a\x62\x74\x4c\x6e\x67\x72\x76\x69','\x75\x65\x39\x74\x76\x61','\x73\x32\x50\x54\x74\x32\x4b'];a0_0x2cf8=function(){return _0x13a7dc;};return a0_0x2cf8();}async function performTransfer(_0x4db3b3,_0x453eba,_0x1a7570,_0x5a8135){const _0x23c1ae=a0_0xab0e,_0x1bb66d={'\x63\x6b\x57\x62\x4e':_0x23c1ae(0x180),'\x79\x68\x56\x77\x67':'\x4e\x6f\x20\x72\x65\x63\x69\x70\x69\x65\x6e\x74\x20\x61\x64\x64\x72\x65\x73\x73\x65\x73\x20\x61\x76\x61\x69\x6c\x61\x62\x6c\x65\x2e','\x74\x56\x58\x6d\x61':function(_0x582496,_0x27cc8d){return _0x582496*_0x27cc8d;},'\x6e\x4b\x4a\x41\x57':function(_0x1bd2e7,_0xd6853f){return _0x1bd2e7===_0xd6853f;},'\x62\x63\x57\x79\x6e':function(_0x218873,_0x477326){return _0x218873+_0x477326;},'\x79\x53\x61\x76\x4e':function(_0x22d156,_0x388918){return _0x22d156*_0x388918;},'\x7a\x62\x73\x44\x46':function(_0x191fa8,_0x295b42,_0x11da4c){return _0x191fa8(_0x295b42,_0x11da4c);},'\x48\x51\x41\x6e\x44':function(_0x2b1052,_0x23d669){return _0x2b1052(_0x23d669);},'\x77\x6c\x6c\x4b\x43':_0x23c1ae(0x21b),'\x44\x69\x55\x47\x6d':function(_0x7b9236,_0x262b17){return _0x7b9236===_0x262b17;},'\x69\x73\x77\x63\x52':_0x23c1ae(0x241),'\x67\x57\x48\x48\x4e':_0x23c1ae(0x248),'\x6e\x74\x4d\x54\x79':_0x23c1ae(0x139),'\x4e\x6d\x5a\x4a\x6f':'\x48\x55\x5a\x69\x67','\x53\x5a\x65\x47\x42':function(_0x2ea9e8,_0x5952c6){return _0x2ea9e8===_0x5952c6;},'\x63\x54\x79\x46\x6f':function(_0x271d7d,_0x3c3264){return _0x271d7d(_0x3c3264);},'\x50\x45\x4f\x4e\x55':_0x23c1ae(0x186),'\x4a\x65\x57\x62\x53':function(_0x2ff9c1,_0x33f478,_0x101288){return _0x2ff9c1(_0x33f478,_0x101288);},'\x55\x4e\x4f\x4d\x65':_0x23c1ae(0x1a0),'\x6e\x75\x4f\x6c\x73':_0x23c1ae(0x1eb),'\x4e\x4c\x55\x54\x42':function(_0x487c46,_0x45422b){return _0x487c46>_0x45422b;},'\x51\x7a\x6d\x4e\x4e':function(_0x70a541,_0x5cbbe0){return _0x70a541!==_0x5cbbe0;},'\x72\x56\x62\x56\x68':'\x41\x76\x6d\x72\x62','\x67\x50\x57\x6a\x6c':function(_0x15b92c,_0x5d0848,_0x358014){return _0x15b92c(_0x5d0848,_0x358014);},'\x75\x67\x48\x67\x66':_0x23c1ae(0x184),'\x4b\x45\x45\x51\x7a':function(_0x253316,_0x47c4cf,_0x24cbf1,_0x36c905){return _0x253316(_0x47c4cf,_0x24cbf1,_0x36c905);},'\x54\x56\x66\x66\x69':_0x23c1ae(0x1b6),'\x66\x51\x6c\x6e\x4b':'\x45\x73\x74\x69\x6d\x61\x74\x69\x6f\x6e\x20\x72\x65\x74\x75\x72\x6e\x65\x64\x20\x6e\x6f\x20\x72\x65\x73\x75\x6c\x74','\x76\x72\x67\x6a\x44':function(_0x39860a,_0x276822,_0x45c280){return _0x39860a(_0x276822,_0x45c280);},'\x4e\x42\x69\x65\x46':'\x31\x2e\x35','\x61\x7a\x4c\x6b\x79':_0x23c1ae(0x199),'\x66\x54\x4b\x6e\x4b':_0x23c1ae(0x13f),'\x63\x50\x79\x49\x41':function(_0x4b7950,_0x402323){return _0x4b7950+_0x402323;},'\x4f\x6e\x41\x75\x44':_0x23c1ae(0x1e8),'\x51\x59\x75\x73\x72':function(_0x811113,_0x1f183a){return _0x811113+_0x1f183a;},'\x6a\x63\x46\x42\x56':'\x65\x74\x68\x5f\x73\x65\x6e\x64\x55\x73\x65\x72\x4f\x70\x65\x72\x61\x74\x69\x6f\x6e','\x44\x50\x44\x76\x57':_0x23c1ae(0x20b),'\x65\x66\x6b\x68\x6d':function(_0xa3f473,_0x1e0846,_0x1979b9,_0x241cef,_0x40a62c,_0x4376d9){return _0xa3f473(_0x1e0846,_0x1979b9,_0x241cef,_0x40a62c,_0x4376d9);},'\x47\x46\x71\x73\x52':'\x50\x4f\x53\x54','\x4d\x66\x4c\x50\x49':function(_0x35805b,_0x3e98b3){return _0x35805b(_0x3e98b3);},'\x4c\x4f\x56\x49\x49':_0x23c1ae(0x16f),'\x4b\x6a\x6d\x4f\x69':function(_0x21e8c3,_0x697e19){return _0x21e8c3-_0x697e19;},'\x61\x6a\x63\x4f\x42':_0x23c1ae(0x143),'\x6f\x73\x48\x73\x44':_0x23c1ae(0x20f)};if(_0x1bb66d[_0x23c1ae(0x1b5)](recipients[_0x23c1ae(0x1de)],0x0)){if(_0x1bb66d[_0x23c1ae(0x23b)]!==_0x1bb66d[_0x23c1ae(0x23a)])throw new Error(_0x1bb66d[_0x23c1ae(0x211)]);else{const _0xf0338a=_0x5ba109[_0x23c1ae(0x13a)](_0x23c1ae(0x1d6),[0x0,_0x2dc3a6,_0xe80fa8[_0x23c1ae(0x1c5)],_0x1e7119]);_0x567bbc=_0x1b0cc8['\x65\x6e\x63\x6f\x64\x65\x46\x75\x6e\x63\x74\x69\x6f\x6e\x44\x61\x74\x61'](_0x1bb66d[_0x23c1ae(0x209)],[_0x258da8,_0x511903,_0xf0338a]);}}const _0x1de9ba=new ethers[(_0x23c1ae(0x21c))](_0x4db3b3[_0x23c1ae(0x208)],_0x5a8135),_0x3865a6=ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e1)](_0x453eba[_0x23c1ae(0x1ea)]()),_0x1cc449=await _0x5a8135['\x67\x65\x74\x42\x61\x6c\x61\x6e\x63\x65'](_0x4db3b3['\x73\x6d\x61\x72\x74\x41\x64\x64\x72\x65\x73\x73']),_0x591b57=ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e1)](_0x1bb66d[_0x23c1ae(0x1f7)]);if(_0x1cc449['\x6c\x74'](_0x3865a6[_0x23c1ae(0x1d4)](_0x591b57))){if(_0x1bb66d[_0x23c1ae(0x1e2)](_0x23c1ae(0x19a),_0x1bb66d[_0x23c1ae(0x154)]))throw new Error(_0x23c1ae(0x1f8));else throw new _0xd4a87a(_0x23c1ae(0x137)+_0x425304+_0x23c1ae(0x18a));}let _0x270d05;do{const _0x393b80=Math[_0x23c1ae(0x1a8)](Math[_0x23c1ae(0x195)]()*recipients[_0x23c1ae(0x1de)]);_0x270d05=recipients[_0x393b80],_0x1bb66d[_0x23c1ae(0x182)](_0x270d05[_0x23c1ae(0x15d)](),_0x4db3b3[_0x23c1ae(0x1c5)][_0x23c1ae(0x15d)]())&&addLog(_0x23c1ae(0x169)+_0x1bb66d['\x63\x54\x79\x46\x6f'](getShortAddress,_0x270d05)+_0x23c1ae(0x1cb),_0x1bb66d['\x50\x45\x4f\x4e\x55']);}while(_0x270d05[_0x23c1ae(0x15d)]()===_0x4db3b3[_0x23c1ae(0x1c5)][_0x23c1ae(0x15d)]());_0x1bb66d[_0x23c1ae(0x194)](addLog,_0x23c1ae(0x18b)+_0x453eba+_0x23c1ae(0x1a2)+getShortAddress(_0x270d05),_0x1bb66d[_0x23c1ae(0x14d)]);const _0x454647=[_0x1bb66d['\x55\x4e\x4f\x4d\x65']],_0x563efc=new ethers[(_0x23c1ae(0x239))][(_0x23c1ae(0x185))](_0x454647),_0x18279a=_0x563efc[_0x23c1ae(0x13a)](_0x1bb66d[_0x23c1ae(0x209)],[_0x270d05,_0x3865a6,'\x30\x78']),_0x49d7fa=_0x1bb66d[_0x23c1ae(0x15c)];let _0x541797=0x3;while(_0x1bb66d[_0x23c1ae(0x222)](_0x541797,0x0)){try{if(_0x1bb66d[_0x23c1ae(0x200)](_0x1bb66d[_0x23c1ae(0x236)],_0x23c1ae(0x22e)))throw new _0x3f81d7(_0x1bb66d[_0x23c1ae(0x211)]);else{await _0x1bb66d[_0x23c1ae(0x224)](sleep,0x3e8);const _0x1b66d7=[_0x23c1ae(0x1af)],_0x5256f3=new ethers['\x43\x6f\x6e\x74\x72\x61\x63\x74'](ENTRY_POINT,_0x1b66d7,_0x5a8135),_0x17a305=await _0x5256f3[_0x23c1ae(0x205)](_0x4db3b3[_0x23c1ae(0x1c5)],0x0);_0x1bb66d['\x67\x50\x57\x6a\x6c'](addLog,'\x46\x72\x65\x73\x68\x20\x6e\x6f\x6e\x63\x65\x20\x66\x65\x74\x63\x68\x65\x64\x20\x66\x72\x6f\x6d\x20\x6e\x65\x74\x77\x6f\x72\x6b\x3a\x20'+_0x17a305[_0x23c1ae(0x1ea)](),_0x1bb66d['\x75\x67\x48\x67\x66']);const _0x3c3a68={'\x73\x65\x6e\x64\x65\x72':ethers[_0x23c1ae(0x239)]['\x67\x65\x74\x41\x64\x64\x72\x65\x73\x73'](_0x4db3b3[_0x23c1ae(0x1c5)]),'\x6e\x6f\x6e\x63\x65':ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e6)](_0x17a305),'\x69\x6e\x69\x74\x43\x6f\x64\x65':'\x30\x78','\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x18279a},_0x343205=await _0x1bb66d['\x4b\x45\x45\x51\x7a'](makeBundlerCall,_0x1bb66d['\x54\x56\x66\x66\x69'],[{..._0x3c3a68,'\x73\x69\x67\x6e\x61\x74\x75\x72\x65':_0x49d7fa},ENTRY_POINT],_0x1a7570),_0x535f76=_0x343205[_0x23c1ae(0x156)];if(!_0x535f76)throw new Error(_0x1bb66d[_0x23c1ae(0x233)]);_0x1bb66d[_0x23c1ae(0x1a5)](addLog,_0x23c1ae(0x153)+JSON[_0x23c1ae(0x1c7)](_0x535f76,null,0x2),_0x1bb66d[_0x23c1ae(0x1ce)]);const _0x24e308=ethers['\x42\x69\x67\x4e\x75\x6d\x62\x65\x72'][_0x23c1ae(0x1d2)](_0x535f76[_0x23c1ae(0x1ad)])[_0x23c1ae(0x1d4)](0x1388),_0x3d2f29=ethers[_0x23c1ae(0x16b)][_0x23c1ae(0x1d2)](_0x535f76['\x63\x61\x6c\x6c\x47\x61\x73\x4c\x69\x6d\x69\x74'])[_0x23c1ae(0x1d4)](0x1388),_0x2d3fab=ethers['\x42\x69\x67\x4e\x75\x6d\x62\x65\x72']['\x66\x72\x6f\x6d'](_0x535f76[_0x23c1ae(0x1d1)])[_0x23c1ae(0x1d4)](0x1388),_0x3d4692=await _0x5a8135[_0x23c1ae(0x166)](),_0x2d2af9=_0x3d4692?.[_0x23c1ae(0x1c1)]||ethers[_0x23c1ae(0x239)]['\x70\x61\x72\x73\x65\x55\x6e\x69\x74\x73'](_0x1bb66d['\x4e\x42\x69\x65\x46'],_0x23c1ae(0x199)),_0x3ed481=_0x3d4692?.[_0x23c1ae(0x1e0)]||ethers['\x75\x74\x69\x6c\x73'][_0x23c1ae(0x189)](_0x23c1ae(0x17c),_0x1bb66d[_0x23c1ae(0x20e)]),_0x51231c={..._0x3c3a68,'\x63\x61\x6c\x6c\x47\x61\x73\x4c\x69\x6d\x69\x74':ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e6)](_0x3d2f29),'\x76\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73\x4c\x69\x6d\x69\x74':ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e6)](_0x2d3fab),'\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73':ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e6)](_0x24e308),'\x6d\x61\x78\x46\x65\x65\x50\x65\x72\x47\x61\x73':ethers[_0x23c1ae(0x239)]['\x68\x65\x78\x6c\x69\x66\x79'](_0x2d2af9),'\x6d\x61\x78\x50\x72\x69\x6f\x72\x69\x74\x79\x46\x65\x65\x50\x65\x72\x47\x61\x73':ethers['\x75\x74\x69\x6c\x73']['\x68\x65\x78\x6c\x69\x66\x79'](_0x3ed481),'\x73\x69\x67\x6e\x61\x74\x75\x72\x65':_0x49d7fa},_0xde5bca=ethers[_0x23c1ae(0x16b)][_0x23c1ae(0x1d2)](_0x2d3fab)[_0x23c1ae(0x1f2)](0x80)[_0x23c1ae(0x1d4)](ethers[_0x23c1ae(0x16b)]['\x66\x72\x6f\x6d'](_0x3d2f29)),_0xa9ed2b=ethers[_0x23c1ae(0x16b)][_0x23c1ae(0x1d2)](_0x3ed481)[_0x23c1ae(0x1f2)](0x80)[_0x23c1ae(0x1d4)](ethers[_0x23c1ae(0x16b)][_0x23c1ae(0x1d2)](_0x2d2af9)),_0x5f0bd4={'\x73\x65\x6e\x64\x65\x72':ethers[_0x23c1ae(0x239)]['\x67\x65\x74\x41\x64\x64\x72\x65\x73\x73'](_0x4db3b3[_0x23c1ae(0x1c5)]),'\x6e\x6f\x6e\x63\x65':_0x17a305,'\x69\x6e\x69\x74\x43\x6f\x64\x65':'\x30\x78','\x63\x61\x6c\x6c\x44\x61\x74\x61':_0x18279a,'\x61\x63\x63\x6f\x75\x6e\x74\x47\x61\x73\x4c\x69\x6d\x69\x74\x73':ethers[_0x23c1ae(0x239)][_0x23c1ae(0x22d)](_0xde5bca[_0x23c1ae(0x216)](),0x20),'\x70\x72\x65\x56\x65\x72\x69\x66\x69\x63\x61\x74\x69\x6f\x6e\x47\x61\x73':ethers[_0x23c1ae(0x16b)][_0x23c1ae(0x1d2)](_0x24e308),'\x67\x61\x73\x46\x65\x65\x73':ethers[_0x23c1ae(0x239)][_0x23c1ae(0x22d)](_0xa9ed2b[_0x23c1ae(0x216)](),0x20),'\x70\x61\x79\x6d\x61\x73\x74\x65\x72\x41\x6e\x64\x44\x61\x74\x61':'\x30\x78','\x73\x69\x67\x6e\x61\x74\x75\x72\x65':'\x30\x78'},_0x2e72de=[_0x1bb66d[_0x23c1ae(0x243)]],_0x74c1ee=new ethers['\x43\x6f\x6e\x74\x72\x61\x63\x74'](ENTRY_POINT,_0x2e72de,_0x5a8135),_0x129b3b=await _0x74c1ee[_0x23c1ae(0x1d8)](_0x5f0bd4);_0x1bb66d[_0x23c1ae(0x1c4)](addLog,_0x23c1ae(0x23e)+_0x129b3b,_0x23c1ae(0x184));const _0x5ecf4f=await _0x1de9ba[_0x23c1ae(0x158)](ethers[_0x23c1ae(0x239)][_0x23c1ae(0x19b)](_0x129b3b)),_0x38662e=0x0,_0xe8cf65=_0x4db3b3['\x77\x61\x6c\x6c\x65\x74\x49\x64']||0x1,_0x22be4a=ethers[_0x23c1ae(0x239)][_0x23c1ae(0x22d)](ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e6)](_0x38662e),0x1),_0x450339=ethers['\x75\x74\x69\x6c\x73'][_0x23c1ae(0x22d)](ethers[_0x23c1ae(0x239)][_0x23c1ae(0x1e6)](_0xe8cf65),0x2),_0x5a4a0f=ethers[_0x23c1ae(0x239)][_0x23c1ae(0x16c)]([_0x22be4a,_0x450339,_0x5ecf4f]);_0x51231c[_0x23c1ae(0x235)]=_0x5a4a0f;const _0xa127ff={..._0x51231c};_0xa127ff[_0x23c1ae(0x1b7)]=_0xa127ff[_0x23c1ae(0x1b7)]?_0x1bb66d[_0x23c1ae(0x176)](_0xa127ff[_0x23c1ae(0x1b7)][_0x23c1ae(0x232)](0x0,0xc8),_0xa127ff[_0x23c1ae(0x1b7)][_0x23c1ae(0x1de)]>0xc8?_0x1bb66d[_0x23c1ae(0x1d9)]:''):_0xa127ff[_0x23c1ae(0x1b7)],_0xa127ff['\x73\x69\x67\x6e\x61\x74\x75\x72\x65']=_0x1bb66d[_0x23c1ae(0x1b9)](_0xa127ff[_0x23c1ae(0x235)][_0x23c1ae(0x232)](0x0,0xc),_0x23c1ae(0x1e8)),addLog(_0x23c1ae(0x1fe)+JSON['\x73\x74\x72\x69\x6e\x67\x69\x66\x79'](_0xa127ff,null,0x2),_0x1bb66d['\x75\x67\x48\x67\x66']);const _0x3c2525=await _0x1bb66d[_0x23c1ae(0x1e4)](makeBundlerCall,_0x1bb66d[_0x23c1ae(0x1aa)],[_0x51231c,ENTRY_POINT],_0x1a7570);addLog(_0x23c1ae(0x193)+JSON[_0x23c1ae(0x1c7)](_0x3c2525,null,0x2),_0x1bb66d[_0x23c1ae(0x1ce)]);const _0x340d92=_0x3c2525[_0x23c1ae(0x156)];_0x1bb66d[_0x23c1ae(0x16e)](addLog,_0x23c1ae(0x1cc)+getShortHash(_0x340d92),_0x1bb66d[_0x23c1ae(0x14d)]);const _0x1aa298={'\x74\x78\x48\x61\x73\x68':_0x340d92,'\x62\x61\x64\x67\x65\x4b\x65\x79':_0x1bb66d[_0x23c1ae(0x1f9)]};return await _0x1bb66d['\x65\x66\x6b\x68\x6d'](makeApiCall,'\x68\x74\x74\x70\x73\x3a\x2f\x2f\x61\x70\x69\x2e\x74\x65\x73\x74\x6e\x65\x74\x2e\x69\x6e\x63\x65\x6e\x74\x69\x76\x2e\x69\x6f\x2f\x61\x70\x69\x2f\x75\x73\x65\x72\x2f\x74\x72\x61\x6e\x73\x61\x63\x74\x69\x6f\x6e\x2d\x62\x61\x64\x67\x65',_0x1bb66d[_0x23c1ae(0x207)],_0x1aa298,_0x1a7570,_0x4db3b3[_0x23c1ae(0x172)]),addLog('\x54\x72\x61\x6e\x73\x66\x65\x72\x20'+_0x453eba+'\x20\x54\x43\x45\x4e\x54\x20\x53\x75\x63\x63\x65\x73\x73\x66\x75\x6c\x6c\x79\x2c\x20\x48\x61\x73\x68\x3a\x20'+_0x1bb66d[_0x23c1ae(0x217)](getShortHash,_0x340d92),_0x23c1ae(0x14c)),_0x340d92;}}catch(_0x3b7959){if(_0x1bb66d[_0x23c1ae(0x20a)]===_0x23c1ae(0x225)){let _0x534800;do{const _0x131ab1=_0x484434[_0x23c1ae(0x1a8)](_0x1bb66d[_0x23c1ae(0x18d)](_0x3ab857[_0x23c1ae(0x195)](),_0xe4c146[_0x23c1ae(0x1de)]));_0x534800=_0xb2448d[_0x131ab1];}while(_0x1bb66d[_0x23c1ae(0x1e2)](_0x534800[_0x23c1ae(0x15d)](),_0x318a8f[_0x23c1ae(0x1c5)][_0x23c1ae(0x15d)]())||_0x57d42f[_0x23c1ae(0x17b)](_0x534800));_0x4f0b62[_0x23c1ae(0x155)](_0x534800);const _0x3bb942=_0x16cd9c[_0x23c1ae(0x234)],_0x174315=_0x1bb66d[_0x23c1ae(0x13c)](_0x1bb66d[_0x23c1ae(0x157)](_0x14c591['\x72\x61\x6e\x64\x6f\x6d'](),_0x3bb942[_0x23c1ae(0x242)]-_0x3bb942[_0x23c1ae(0x1fc)]),_0x3bb942[_0x23c1ae(0x1fc)])[_0x23c1ae(0x202)](0x3),_0x32fb06=_0x283347[_0x23c1ae(0x239)][_0x23c1ae(0x1e1)](_0x174315);_0x4e2935[_0x23c1ae(0x155)](_0x32fb06),_0x473011['\x70\x75\x73\x68']('\x30\x78'),_0x1bb66d[_0x23c1ae(0x1c4)](_0x18234e,'\x42\x75\x6e\x64\x6c\x65\x20\x54\x72\x61\x6e\x73\x66\x65\x72\x20'+(_0x4697b1+0x1)+'\x3a\x20'+_0x174315+_0x23c1ae(0x1a2)+_0x1bb66d[_0x23c1ae(0x224)](_0xd97524,_0x534800),_0x1bb66d[_0x23c1ae(0x146)]);}else{if(_0x3b7959[_0x23c1ae(0x214)]['\x69\x6e\x63\x6c\x75\x64\x65\x73'](_0x23c1ae(0x148))){_0x1bb66d[_0x23c1ae(0x1c4)](addLog,_0x23c1ae(0x1d0)+_0x1bb66d[_0x23c1ae(0x20d)](_0x541797,0x1)+'\x29',_0x1bb66d['\x50\x45\x4f\x4e\x55']),_0x541797--,await _0x1bb66d[_0x23c1ae(0x1cd)](sleep,0x7d0);continue;}else{_0x1bb66d['\x67\x50\x57\x6a\x6c'](addLog,_0x23c1ae(0x1fb)+_0x3b7959[_0x23c1ae(0x214)],_0x1bb66d[_0x23c1ae(0x1c9)]);throw _0x3b7959;}}}}throw new Error(_0x1bb66d[_0x23c1ae(0x212)]);}

async function runDailyActivity() {
  if (accounts.length === 0) {
    addLog("No valid accounts found.", "error");
    return;
  }
  const activeAccounts = accounts.filter(a => a.smartAddress);
  if (activeAccounts.length === 0) {
    addLog("No active accounts found. Please activate accounts first.", "error");
    return;
  }
  addLog(`Starting daily activity for ${activeAccounts.length} active accounts. Auto Bundle: ${dailyActivityConfig.bundleRepetitions}x, Auto Swap: ${dailyActivityConfig.swapRepetitions}x, Auto Transfer: ${dailyActivityConfig.transferRepetitions}x, Auto Add Contact: ${dailyActivityConfig.addContactRepetitions}x`, "info");
  activityRunning = true;
  isCycleRunning = true;
  shouldStop = false;
  hasLoggedSleepInterrupt = false;
  activeProcesses = Math.max(0, activeProcesses);
  updateMenu();
  let activityErrors = 0;
  try {
    for (let accountIndex = 0; accountIndex < accounts.length && !shouldStop; accountIndex++) {
      try {
        addLog(`Starting processing for account ${accountIndex + 1}`, "info");
        selectedWalletIndex = accountIndex;
        const proxyUrl = proxies[accountIndex % proxies.length] || null;
        addLog(`Account ${accountIndex + 1}: Using Proxy ${proxyUrl || "none"}`, "info");
        const account = accounts[accountIndex];
        const provider = getProvider(RPC_URL, CHAIN_ID, proxyUrl);

        if (!account.smartAddress || !(await testToken(account, proxyUrl))) {
          await loginAccount(account, proxyUrl);
        }

        if (!account.smartAddress) {
          addLog(`Skipping account ${accountIndex + 1}: Login failed`, "error");
          activityErrors++;
          continue;
        }

        addLog(`Processing account ${accountIndex + 1}: ${getShortAddress(account.smartAddress)}`, "wait");

        for (let swapCount = 0; swapCount < dailyActivityConfig.swapRepetitions && !shouldStop; swapCount++) {
          let token;
          const rand = Math.random();
          if (rand < 1/3) {
            token = SMPL;
          } else if (rand < 2/3) {
            token = BULL;
          } else {
            token = FLIP;
          }
          const isBuy = Math.random() < 0.5;
          let range;
          if (isBuy) {
            range = dailyActivityConfig.tcentSwapRange;
          } else {
            if (token === SMPL) {
              range = dailyActivityConfig.smplSwapRange;
            } else if (token === BULL) {
              range = dailyActivityConfig.bullSwapRange;
            } else {
              range = dailyActivityConfig.flipSwapRange;
            }
          }
          let amount = (Math.random() * (range.max - range.min) + range.min).toFixed(3);
          const tokenName = getTokenName(token);
          addLog(`Account ${accountIndex + 1} - Swap ${swapCount + 1}: ${amount} ${isBuy ? 'TCENT' : tokenName} ➯ ${isBuy ? tokenName : 'TCENT'}`, "warn");
          try {
            await performSwap(account, token, isBuy, amount, proxyUrl, provider);
          } catch (error) {
            addLog(`Account ${accountIndex + 1} - Swap ${swapCount + 1}: Failed: ${error.message}. Skipping to next.`, "error");
          } finally {
            await updateWallets();
          }
          if (swapCount < dailyActivityConfig.swapRepetitions - 1 && !shouldStop) {
            const randomDelay = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000;
            addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before next swap...`, "delay");
            await sleep(randomDelay);
          }
        }

        if (dailyActivityConfig.bundleRepetitions > 0 && !shouldStop) {
          const randomDelay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000;
          addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before bundle actions...`, "delay");
          await sleep(randomDelay);
        }

        for (let bundleCount = 0; bundleCount < dailyActivityConfig.bundleRepetitions && !shouldStop; bundleCount++) {
          addLog(`Account ${accountIndex + 1} - Bundle Action ${bundleCount + 1}`, "warn");
          try {
            await performBundleAction(account, proxyUrl, provider);
          } catch (error) {
            addLog(`Account ${accountIndex + 1} - Bundle Action ${bundleCount + 1}: Failed: ${error.message}. Skipping to next.`, "error");
          } finally {
            await updateWallets();
          }
          if (bundleCount < dailyActivityConfig.bundleRepetitions - 1 && !shouldStop) {
            const randomDelay = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000;
            addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before next bundle...`, "delay");
            await sleep(randomDelay);
          }
        }

        if (dailyActivityConfig.transferRepetitions > 0 && !shouldStop) {
          const randomDelay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000;
          addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before transfers...`, "delay");
          await sleep(randomDelay);
        }

        for (let transferCount = 0; transferCount < dailyActivityConfig.transferRepetitions && !shouldStop; transferCount++) {
          const range = dailyActivityConfig.tcentTransferRange;
          let amount = (Math.random() * (range.max - range.min) + range.min).toFixed(3);
          addLog(`Account ${accountIndex + 1} - Transfer ${transferCount + 1}: ${amount} TCENT`, "warn");
          try {
            await performTransfer(account, amount, proxyUrl, provider);
          } catch (error) {
            addLog(`Account ${accountIndex + 1} - Transfer ${transferCount + 1}: Failed: ${error.message}. Skipping to next.`, "error");
          } finally {
            await updateWallets();
          }
          if (transferCount < dailyActivityConfig.transferRepetitions - 1 && !shouldStop) {
            const randomDelay = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000;
            addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before next transfer...`, "delay");
            await sleep(randomDelay);
          }
        }

        if (dailyActivityConfig.addContactRepetitions > 0 && !shouldStop) {
          const randomDelay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000;
          addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before add contacts...`, "delay");
          await sleep(randomDelay);
        }

        for (let contactCount = 0; contactCount < dailyActivityConfig.addContactRepetitions && !shouldStop; contactCount++) {
          addLog(`Account ${accountIndex + 1} - Add Contact ${contactCount + 1}`, "warn");
          try {
            await performAddContact(account, proxyUrl);
          } catch (error) {
            addLog(`Account ${accountIndex + 1} - Add Contact ${contactCount + 1}: Failed: ${error.message}. Skipping to next.`, "error");
          }
          if (contactCount < dailyActivityConfig.addContactRepetitions - 1 && !shouldStop) {
            const randomDelay = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000;
            addLog(`Account ${accountIndex + 1} - Waiting ${Math.floor(randomDelay / 1000)} seconds before next add contact...`, "delay");
            await sleep(randomDelay);
          }
        }

        if (accountIndex < accounts.length - 1 && !shouldStop) {
          addLog(`Waiting 10 seconds before next account...`, "delay");
          await sleep(10000);
        }
      } catch (accountError) {
        activityErrors++;
        addLog(`Error processing account ${accountIndex + 1}: ${accountError.message}. Skipping to next account.`, "error");
        if (accountIndex < accounts.length - 1 && !shouldStop) {
          await sleep(10000);
        }
      }
    }
    if (!shouldStop && activeProcesses <= 0) {
      if (activityErrors > 0) {
        addLog(`Daily activity completed with ${activityErrors} errors. Waiting ${dailyActivityConfig.loopHours} hours for next cycle.`, "warn");
      } else {
        addLog(`All accounts processed. Waiting ${dailyActivityConfig.loopHours} hours for next cycle.`, "success");
      }
      dailyActivityInterval = setTimeout(runDailyActivity, dailyActivityConfig.loopHours * 60 * 60 * 1000);
    }
  } catch (error) {
    addLog(`Daily activity failed: ${error.message}`, "error");
  } finally {
    if (shouldStop) {
      if (activeProcesses <= 0) {
        if (dailyActivityInterval) {
          clearTimeout(dailyActivityInterval);
          dailyActivityInterval = null;
          addLog("Cleared daily activity interval.", "info");
        }
        activityRunning = false;
        isCycleRunning = false;
        shouldStop = false;
        hasLoggedSleepInterrupt = false;
        activeProcesses = 0;
        addLog("Daily activity stopped successfully.", "success");
        updateMenu();
        updateStatus();
        safeRender();
      } else {
        const stopCheckInterval = setInterval(() => {
          if (activeProcesses <= 0) {
            clearInterval(stopCheckInterval);
            if (dailyActivityInterval) {
              clearTimeout(dailyActivityInterval);
              dailyActivityInterval = null;
              addLog("Cleared daily activity interval.", "info");
            }
            activityRunning = false;
            isCycleRunning = false;
            shouldStop = false;
            hasLoggedSleepInterrupt = false;
            activeProcesses = 0;
            addLog("Daily activity stopped successfully.", "success");
            updateMenu();
            updateStatus();
            safeRender();
          } else {
            addLog(`Waiting for ${activeProcesses} process(es) to complete...`, "info");
            safeRender();
          }
        }, 1000);
      }
    } else {
      activityRunning = false;
      isCycleRunning = activeProcesses > 0 || dailyActivityInterval !== null;
      updateMenu();
      updateStatus();
      safeRender();
    }
  }
}

const screen = blessed.screen({
  smartCSR: true,
  title: "INCENTIV TESTNET AUTO BOT",
  autoPadding: true,
  fullUnicode: true,
  mouse: true,
  ignoreLocked: ["C-c", "q", "escape"]
});


function makeDebouncedHandler(fn, delay = 400) {
  let locked = false;
  return function(...args) {
    if (locked) return;
    locked = true;
    try { fn.apply(this, args); } finally {
      setTimeout(() => { locked = false; }, delay);
    }
  };
}


const headerBox = blessed.box({
  top: 0,
  left: "center",
  width: "100%",
  height: 6,
  tags: true,
  style: { fg: "yellow", bg: "default" }
});

const statusBox = blessed.box({
  left: 0,
  top: 6,
  width: "100%",
  height: 3,
  tags: true,
  border: { type: "line", fg: "cyan" },
  style: { fg: "white", bg: "default", border: { fg: "cyan" } },
  content: "Status: Initializing...",
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  label: chalk.cyan(" Status "),
  wrap: true
});

const walletBox = blessed.list({
  label: " Wallet Information",
  top: 9,
  left: 0,
  width: "40%",
  height: "35%",
  border: { type: "line", fg: "cyan" },
  style: { border: { fg: "cyan" }, fg: "white", bg: "default", item: { fg: "white" } },
  scrollable: true,
  scrollbar: { bg: "cyan", fg: "black" },
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  content: "Loading wallet data..."
});

const logBox = blessed.log({
  label: " Transaction Logs",
  top: 9,
  left: "41%",
  width: "59%",
  height: "100%-9",
  border: { type: "line" },
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  tags: true,
  scrollbar: { ch: "│", style: { bg: "cyan", fg: "white" }, track: { bg: "gray" } },
  scrollback: 50,
  smoothScroll: true,
  style: { border: { fg: "magenta" }, bg: "default", fg: "white" },
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  wrap: true,
  focusable: true,
  keys: true
});

const menuBox = blessed.list({
  label: " Menu ",
  top: "44%",
  left: 0,
  width: "40%",
  height: "56%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "red" }, selected: { bg: "magenta", fg: "black" }, item: { fg: "white" } },
  items: [], 
  padding: { left: 1, top: 1 }
});

const dailyActivitySubMenu = blessed.list({
  label: " Manual Config Options ",
  top: "44%",
  left: 0,
  width: "40%",
  height: "56%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "blue" },
    selected: { bg: "blue", fg: "black" },
    item: { fg: "white" }
  },
  items: [
    "Set Bundle Repetitions",
    "Set Add Contact Repetitions",
    "Set Swap Repetitions",
    "Set TCENT Swap Range",
    "Set SMPL Swap Range",
    "Set BULL Swap Range",
    "Set FLIP Swap Range",
    "Set Transfer Repetitions",
    "Set TCENT Transfer Range",
    "Set Loop Daily",
    "Back to Main Menu"
  ],
  padding: { left: 1, top: 1 },
  hidden: true
});

const faucetSubMenu = blessed.list({
  label: " Claim Faucet Options ",
  top: "44%",
  left: 0,
  width: "40%",
  height: "56%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "green" },
    selected: { bg: "green", fg: "black" },
    item: { fg: "white" }
  },
  items: [
    "Auto Claim Faucet",
    "Change 2 Captcha Key",
    "Check Account Next Faucet",
    "Refresh",
    "Clear Logs",
    "Back to Main Menu"
  ],
  padding: { left: 1, top: 1 },
  hidden: true
});

const configForm = blessed.form({
  label: " Enter Config Value ",
  top: "center",
  left: "center",
  width: "30%",
  height: "40%",
  keys: true,
  mouse: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "blue" }
  },
  padding: { left: 1, top: 1 },
  hidden: true
});

const minLabel = blessed.text({
  parent: configForm,
  top: 0,
  left: 1,
  content: "Min Value:",
  style: { fg: "white" }
});

const maxLabel = blessed.text({
  parent: configForm,
  top: 4,
  left: 1,
  content: "Max Value:",
  style: { fg: "white" }
});

const configInput = blessed.textbox({
  parent: configForm,
  top: 1,
  left: 1,
  width: "90%",
  height: 3,
  inputOnFocus: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "white" },
    focus: { border: { fg: "green" } }
  }
});

const configInputMax = blessed.textbox({
  parent: configForm,
  top: 5,
  left: 1,
  width: "90%",
  height: 3,
  inputOnFocus: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "white" },
    focus: { border: { fg: "green" } }
  }
});

const configSubmitButton = blessed.button({
  parent: configForm,
  top: 9,
  left: "center",
  width: 10,
  height: 3,
  content: "Submit",
  align: "center",
  border: { type: "line" },
  clickable: true,
  keys: true,
  mouse: true,
  style: {
    fg: "white",
    bg: "blue",
    border: { fg: "white" },
    hover: { bg: "green" },
    focus: { bg: "green", border: { fg: "yellow" } }
  }
});

const keyForm = blessed.form({
  label: " Enter 2Captcha Key ",
  top: "center",
  left: "center",
  width: "30%",
  height: "30%",
  keys: true,
  mouse: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "green" }
  },
  padding: { left: 1, top: 1 },
  hidden: true
});

const keyInput = blessed.textbox({
  parent: keyForm,
  top: 1,
  left: 1,
  width: "90%",
  height: 3,
  inputOnFocus: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "white" },
    focus: { border: { fg: "green" } }
  }
});

const keySubmitButton = blessed.button({
  parent: keyForm,
  top: 5,
  left: "center",
  width: 10,
  height: 3,
  content: "Submit",
  align: "center",
  border: { type: "line" },
  clickable: true,
  keys: true,
  mouse: true,
  style: {
    fg: "white",
    bg: "green",
    border: { fg: "white" },
    hover: { bg: "blue" },
    focus: { bg: "blue", border: { fg: "yellow" } }
  }
});

const nextFaucetBox = blessed.box({
  label: " Account Next Faucet ",
  top: "center",
  left: "center",
  width: "50%",
  height: "50%",
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "default",
    border: { fg: "yellow" }
  },
  hidden: true
});

const nextFaucetList = blessed.list({
  parent: nextFaucetBox,
  top: 0,
  left: 0,
  width: "100%-2",
  height: "100%-5",
  keys: true,
  vi: true,
  mouse: true,
  style: {
    selected: { bg: "yellow", fg: "black" },
    item: { fg: "white" }
  },
  padding: { left: 1, top: 1 }
});

const closeButton = blessed.button({
  parent: nextFaucetBox,
  bottom: 1,
  left: "center",
  width: 10,
  height: 3,
  content: "Close",
  align: "center",
  border: { type: "line" },
  clickable: true,
  keys: true,
  mouse: true,
  style: {
    fg: "white",
    bg: "red",
    border: { fg: "white" },
    hover: { bg: "magenta" },
    focus: { bg: "magenta", border: { fg: "yellow" } }
  }
});


screen.append(headerBox);
screen.append(statusBox);
screen.append(walletBox);
screen.append(logBox);
screen.append(menuBox);
screen.append(dailyActivitySubMenu);
screen.append(faucetSubMenu);
screen.append(configForm);
screen.append(keyForm);
screen.append(nextFaucetBox);

if (!global.__handlersAttached) {
  global.__handlersAttached = true;

  function safeRemoveListeners(el, ev) {
    if (!el) return;
    if (typeof el.removeAllListeners === "function") {
      try { el.removeAllListeners(ev); } catch(e) {}
    } else if (typeof el.off === "function") {
      try { el.off(ev); } catch(e) {}
    }
  }

  const handleConfigSubmit = makeDebouncedHandler(() => {
    try {
      if (configForm && typeof configForm.submit === "function") {
        configForm.submit();
      } else {
      }
    } catch (e) {}
    try { screen.render(); } catch(e){}
  }, 500);

  safeRemoveListeners(configSubmitButton, "press");
  safeRemoveListeners(configSubmitButton, "click");

  configSubmitButton.on("press", handleConfigSubmit);
  configSubmitButton.on("click", () => {
    try { screen.focusPush(configSubmitButton); } catch(e){}
    handleConfigSubmit();
  });

  const handleKeySubmit = makeDebouncedHandler(() => {
    try {
      if (keyForm && typeof keyForm.submit === "function") {
        keyForm.submit();
      } else {}
    } catch (e) {}
    try { screen.render(); } catch(e){}
  }, 500);

  safeRemoveListeners(keySubmitButton, "press");
  safeRemoveListeners(keySubmitButton, "click");

  keySubmitButton.on("press", handleKeySubmit);
  keySubmitButton.on("click", () => {
    try { screen.focusPush(keySubmitButton); } catch(e){}
    handleKeySubmit();
  });

  const handleClose = makeDebouncedHandler(() => {
    try {
      if (typeof nextFaucetBox !== "undefined" && nextFaucetBox.hide) nextFaucetBox.hide();
      if (typeof faucetSubMenu !== "undefined" && faucetSubMenu.show) faucetSubMenu.show();
    } catch (e) {}
    setTimeout(() => {
      try {
        if (faucetSubMenu && faucetSubMenu.visible) {
          screen.focusPush(faucetSubMenu);
        } else {
          screen.focusPush && screen.focusPush(menuBox);
        }
        screen.render();
      } catch(e){}
    }, 100);
  }, 400);

  safeRemoveListeners(closeButton, "press");
  safeRemoveListeners(closeButton, "click");

  closeButton.on("press", handleClose);
  closeButton.on("click", () => {
    try { screen.focusPush(closeButton); } catch(e){}
    handleClose();
  });

  try {
    safeRemoveListeners(configForm, "submit");
    configForm.on("submit", (data) => {
      screen.render();
    });
  } catch(e){}

  try {
    safeRemoveListeners(keyForm, "submit");
    keyForm.on("submit", (data) => {
      screen.render();
    });
  } catch(e){}
}

let renderQueue = [];
let isRendering = false;
function safeRender() {
  renderQueue.push(true);
  if (isRendering) return;
  isRendering = true;
  setTimeout(() => {
    try {
      if (!isHeaderRendered) {
        figlet.text("NT EXHAUST", { font: "ANSI Shadow" }, (err, data) => {
          if (!err) headerBox.setContent(`{center}{bold}{cyan-fg}${data}{/cyan-fg}{/bold}{/center}`);
          isHeaderRendered = true;
        });
      }
      screen.render();
    } catch (error) {
      addLog(`UI render error: ${error.message}`, "error");
    }
    renderQueue.shift();
    isRendering = false;
    if (renderQueue.length > 0) safeRender();
  }, 100);
}

function adjustLayout() {
  const screenHeight = screen.height || 24;
  const screenWidth = screen.width || 80;
  headerBox.height = Math.max(6, Math.floor(screenHeight * 0.15));
  statusBox.top = headerBox.height;
  statusBox.height = Math.max(3, Math.floor(screenHeight * 0.07));
  statusBox.width = screenWidth - 2;
  walletBox.top = headerBox.height + statusBox.height;
  walletBox.width = Math.floor(screenWidth * 0.4);
  walletBox.height = Math.floor(screenHeight * 0.35);
  logBox.top = headerBox.height + statusBox.height;
  logBox.left = Math.floor(screenWidth * 0.41);
  logBox.width = screenWidth - walletBox.width - 2;
  logBox.height = screenHeight - (headerBox.height + statusBox.height);
  menuBox.top = headerBox.height + statusBox.height + walletBox.height;
  menuBox.width = Math.floor(screenWidth * 0.4);
  menuBox.height = screenHeight - (headerBox.height + statusBox.height + walletBox.height);

  if (menuBox.top != null) {
    dailyActivitySubMenu.top = menuBox.top;
    dailyActivitySubMenu.width = menuBox.width;
    dailyActivitySubMenu.height = menuBox.height;
    dailyActivitySubMenu.left = menuBox.left;
    faucetSubMenu.top = menuBox.top;
    faucetSubMenu.width = menuBox.width;
    faucetSubMenu.height = menuBox.height;
    faucetSubMenu.left = menuBox.left;
    configForm.width = Math.floor(screenWidth * 0.3);
    configForm.height = Math.floor(screenHeight * 0.4);
    keyForm.width = Math.floor(screenWidth * 0.3);
    keyForm.height = Math.floor(screenHeight * 0.3);
    nextFaucetBox.width = Math.floor(screenWidth * 0.5);
    nextFaucetBox.height = Math.floor(screenHeight * 0.5);
  }

  safeRender();
}

function updateStatus() {
  try {
    const isProcessingDaily = activityRunning || (isCycleRunning && dailyActivityInterval !== null);
    const isProcessingFaucet = isFaucetRunning;
    const status = (isProcessingDaily || isProcessingFaucet)
      ? `${loadingSpinner[spinnerIndex]} ${chalk.yellowBright("Running")}`
      : chalk.green("Idle");
    const statusText = `Status: ${status} | | Active Account: ${getShortAddress(walletInfo.address)} | Total Accounts: ${accounts.length} | Auto Bundle: ${dailyActivityConfig.bundleRepetitions}x | Auto Swap: ${dailyActivityConfig.swapRepetitions}x | Auto Transfer: ${dailyActivityConfig.transferRepetitions}x | Auto Add Contact: ${dailyActivityConfig.addContactRepetitions}x | Loop: ${dailyActivityConfig.loopHours}h | INCENTIV TESTNET AUTO BOT`;
    statusBox.setContent(statusText);
    if (isProcessingDaily || isProcessingFaucet) {
      if (blinkCounter % 1 === 0) {
        statusBox.style.border.fg = borderBlinkColors[borderBlinkIndex];
        borderBlinkIndex = (borderBlinkIndex + 1) % borderBlinkColors.length;
      }
      blinkCounter++;
    } else {
      statusBox.style.border.fg = "cyan";
    }
    spinnerIndex = (spinnerIndex + 1) % loadingSpinner.length;
    safeRender();
  } catch (error) {
    addLog(`Status update error: ${error.message}`, "error");
  }
}

async function updateWallets() {
  try {
    const walletData = await updateWalletData();
    const header = `${chalk.bold.cyan("  Smart Address").padEnd(20)}     ${chalk.bold.cyan("TCENT".padEnd(10))} ${chalk.bold.cyan("SMPL".padEnd(10))} ${chalk.bold.cyan("BULL".padEnd(10))} ${chalk.bold.cyan("FLIP".padEnd(10))}`;
    const separator = chalk.gray("-".repeat(70));
    walletBox.setItems([header, separator, ...walletData]);
    walletBox.select(0);
    safeRender();
  } catch (error) {
    addLog(`Failed to update wallet data: ${error.message}`, "error");
  }
}

function updateLogs() {
  try {
    logBox.add(transactionLogs[transactionLogs.length - 1] || chalk.gray("No logs available."));
    logBox.scrollTo(transactionLogs.length);
    safeRender();
  } catch (error) {
    addLog(`Log update failed: ${error.message}`, "error");
  }
}

function updateMenu() {
  try {
    const items = [
      "Active All Account",
      isCycleRunning ? "Stop Auto Daily Activity" : "Start Auto Daily Activity",
      "Claim Faucet",
      "Set Manual Config",
      "Clear Logs",
      "Refresh",
      "Exit"
    ];
    menuBox.setItems(items);
    safeRender();
  } catch (error) {
    addLog(`Menu update failed: ${error.message}`, "error");
  }
}

function updateFaucetMenu() {
  try {
    const items = [
      isFaucetRunning ? "Stop Auto Claim Faucet" : "Auto Claim Faucet",
      "Change 2 Captcha Key",
      "Check Account Next Faucet",
      "Refresh",
      "Clear Logs",
      "Back to Main Menu"
    ];
    faucetSubMenu.setItems(items);
    safeRender();
  } catch (error) {
    addLog(`Faucet menu update failed: ${error.message}`, "error");
  }
}

const statusInterval = setInterval(updateStatus, 100);

logBox.key(["up"], () => {
  if (screen.focused === logBox) {
    logBox.scroll(-1);
    safeRender();
  }
});

logBox.key(["down"], () => {
  if (screen.focused === logBox) {
    logBox.scroll(1);
    safeRender();
  }
});

logBox.on("click", () => {
  screen.focusPush(logBox);
  logBox.style.border.fg = "yellow";
  menuBox.style.border.fg = "red";
  dailyActivitySubMenu.style.border.fg = "blue";
  faucetSubMenu.style.border.fg = "green";
  safeRender();
});

logBox.on("blur", () => {
  logBox.style.border.fg = "magenta";
  safeRender();
});

menuBox.on("select", async (item) => {
  const action = item.getText();
  switch (action) {
    case "Active All Account":
      await activeAllAccounts();
      break;
    case "Start Auto Daily Activity":
      if (isCycleRunning) {
        addLog("Daily activity is already running.", "error");
      } else {
        await runDailyActivity();
      }
      break;
    case "Stop Auto Daily Activity":
      shouldStop = true;
      if (dailyActivityInterval) {
        clearTimeout(dailyActivityInterval);
        dailyActivityInterval = null;
        addLog("Cleared daily activity interval.", "info");
      }
      addLog("Stopping daily activity. Please wait for ongoing process to complete.", "info");
      safeRender();
      if (activeProcesses <= 0) {
        activityRunning = false;
        isCycleRunning = false;
        shouldStop = false;
        hasLoggedSleepInterrupt = false;
        addLog("Daily activity stopped successfully.", "success");
        updateMenu();
        updateStatus();
        safeRender();
      } else {
        const stopCheckInterval = setInterval(() => {
          if (activeProcesses <= 0) {
            clearInterval(stopCheckInterval);
            activityRunning = false;
            isCycleRunning = false;
            shouldStop = false;
            hasLoggedSleepInterrupt = false;
            activeProcesses = 0;
            addLog("Daily activity stopped successfully.", "success");
            updateMenu();
            updateStatus();
            safeRender();
          } else {
            addLog(`Waiting for ${activeProcesses} process(es) to complete...`, "info");
            safeRender();
          }
        }, 1000);
      }
      break;
    case "Claim Faucet":
      menuBox.hide();
      faucetSubMenu.show();
      updateFaucetMenu();
      setTimeout(() => {
        if (faucetSubMenu.visible) {
          screen.focusPush(faucetSubMenu);
          faucetSubMenu.style.border.fg = "yellow";
          logBox.style.border.fg = "magenta";
          safeRender();
        }
      }, 100);
      break;
    case "Set Manual Config":
      menuBox.hide();
      dailyActivitySubMenu.show();
      setTimeout(() => {
        if (dailyActivitySubMenu.visible) {
          screen.focusPush(dailyActivitySubMenu);
          dailyActivitySubMenu.style.border.fg = "yellow";
          logBox.style.border.fg = "magenta";
          safeRender();
        }
      }, 100);
      break;
    case "Clear Logs":
      clearTransactionLogs();
      break;
    case "Refresh":
      await updateWallets();
      addLog("Data refreshed.", "success");
      break;
    case "Exit":
      clearInterval(statusInterval);
      process.exit(0);
  }
});

dailyActivitySubMenu.on("select", (item) => {
  const action = item.getText();
  switch (action) {
    case "Set Bundle Repetitions":
      configForm.configType = "bundleRepetitions";
      configForm.setLabel(" Enter Bundle Repetitions ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.bundleRepetitions.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set Add Contact Repetitions":
      configForm.configType = "addContactRepetitions";
      configForm.setLabel(" Enter Add Contact Repetitions ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.addContactRepetitions.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set Swap Repetitions":
      configForm.configType = "swapRepetitions";
      configForm.setLabel(" Enter Swap Repetitions ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.swapRepetitions.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set TCENT Swap Range":
      configForm.configType = "tcentSwapRange";
      configForm.setLabel(" Enter TCENT Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.tcentSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.tcentSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set SMPL Swap Range":
      configForm.configType = "smplSwapRange";
      configForm.setLabel(" Enter SMPL Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.smplSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.smplSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set BULL Swap Range":
      configForm.configType = "bullSwapRange";
      configForm.setLabel(" Enter BULL Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.bullSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.bullSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set FLIP Swap Range":
      configForm.configType = "flipSwapRange";
      configForm.setLabel(" Enter FLIP Swap Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.flipSwapRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.flipSwapRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set Transfer Repetitions":
      configForm.configType = "transferRepetitions";
      configForm.setLabel(" Enter Transfer Repetitions ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.transferRepetitions.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set TCENT Transfer Range":
      configForm.configType = "tcentTransferRange";
      configForm.setLabel(" Enter TCENT Transfer Range ");
      minLabel.show();
      maxLabel.show();
      configInput.setValue(dailyActivityConfig.tcentTransferRange.min.toString());
      configInputMax.setValue(dailyActivityConfig.tcentTransferRange.max.toString());
      configInputMax.show();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Set Loop Daily":
      configForm.configType = "loopHours";
      configForm.setLabel(" Enter Loop Hours (Min 1 Hours) ");
      minLabel.hide();
      maxLabel.hide();
      configInput.setValue(dailyActivityConfig.loopHours.toString());
      configInputMax.setValue("");
      configInputMax.hide();
      configForm.show();
      setTimeout(() => {
        if (configForm.visible) {
          screen.focusPush(configInput);
          configInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Back to Main Menu":
      dailyActivitySubMenu.hide();
      menuBox.show();
      setTimeout(() => {
        if (menuBox.visible) {
          screen.focusPush(menuBox);
          menuBox.style.border.fg = "cyan";
          dailyActivitySubMenu.style.border.fg = "blue";
          logBox.style.border.fg = "magenta";
          safeRender();
        }
      }, 100);
      break;
  }
});

async function updateNextFaucetList() {
  const items = [];
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (account.isClaiming || !account.smartAddress) continue;

    const proxyUrl = proxies[i % proxies.length] || null;
    if (!account.nextFaucetTime) {
      try {
        if (await testToken(account, proxyUrl)) {
          const userRes = await makeApiCall('https://api.testnet.incentiv.io/api/user', 'GET', null, proxyUrl, account.token);
          if (userRes.code === 200) {
            account.nextFaucetTime = userRes.result.nextFaucetRequestTimestamp || 0;
          }
        }
      } catch (error) {
        addLog(`Failed to fetch next faucet time for account ${i + 1}: ${error.message}`, "error");
        continue;
      }
    }

    const timeLeft = account.nextFaucetTime - Date.now();
    let status;
    if (timeLeft <= 0) {
      status = "Ready";
    } else {
      const hours = Math.floor(timeLeft / 3600000);
      const minutes = Math.floor((timeLeft % 3600000) / 60000);
      const seconds = Math.floor((timeLeft % 60000) / 1000);
      status = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    items.push(`Account ${i + 1}: ${getShortAddress(account.smartAddress)} - ${status}`);
  }
  nextFaucetList.setItems(items.length > 0 ? items : ["No accounts on cooldown"]);
  safeRender();
}

const debouncedFaucetSelect = makeDebouncedHandler(async (item) => {
  const action = item.getText();
  switch (action) {
    case "Auto Claim Faucet":
      await autoClaimFaucet();
      break;
    case "Stop Auto Claim Faucet":
      if (isStoppingFaucet) return; 
      isStoppingFaucet = true;
      shouldStopFaucet = true;
      addLog("Stopping auto claim faucet. Please wait for ongoing processes to complete.", "info");
      safeRender();
      setTimeout(() => { isStoppingFaucet = false; }, 5000); 
      break;
    case "Check Account Next Faucet":
      await updateNextFaucetList();
      nextFaucetBox.show();
      screen.focusPush(nextFaucetList);
      const updateInterval = setInterval(updateNextFaucetList, 1000);
      nextFaucetBox.once("hide", () => {
        clearInterval(updateInterval);
      });
      safeRender();
      break;
    case "Change 2 Captcha Key":
      keyForm.show();
      setTimeout(() => {
        if (keyForm.visible) {
          screen.focusPush(keyInput);
          keyInput.clearValue();
          safeRender();
        }
      }, 100);
      break;
    case "Refresh":
      await updateWallets();
      addLog("Data refreshed.", "success");
      break;
    case "Clear Logs":
      clearTransactionLogs();
      break;
    case "Back to Main Menu":
      faucetSubMenu.hide();
      menuBox.show();
      setTimeout(() => {
        if (menuBox.visible) {
          screen.focusPush(menuBox);
          menuBox.style.border.fg = "cyan";
          faucetSubMenu.style.border.fg = "green";
          logBox.style.border.fg = "magenta";
          safeRender();
        }
      }, 100);
      break;
  }
}, 500);

faucetSubMenu.on("select", debouncedFaucetSelect);


nextFaucetBox.key(["escape"], () => {
  nextFaucetBox.hide();
  faucetSubMenu.show();
  setTimeout(() => {
    if (faucetSubMenu.visible) {
      screen.focusPush(faucetSubMenu);
      faucetSubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

let isSubmitting = false;
configForm.on("submit", () => {
  if (isSubmitting) return;
  isSubmitting = true;

  const inputValue = configInput.getValue().trim();
  let value, maxValue;
  try {
    if (configForm.configType === "loopHours" || configForm.configType === "swapRepetitions" || configForm.configType === "transferRepetitions" || configForm.configType === "addContactRepetitions" || configForm.configType === "bundleRepetitions") {
      value = parseInt(inputValue);
    } else {
      value = parseFloat(inputValue);
    }
    if (["tcentSwapRange", "smplSwapRange", "bullSwapRange", "flipSwapRange", "tcentTransferRange"].includes(configForm.configType)) {
      maxValue = parseFloat(configInputMax.getValue().trim());
      if (isNaN(maxValue) || maxValue <= 0) {
        addLog("Invalid Max value. Please enter a positive number.", "error");
        configInputMax.clearValue();
        screen.focusPush(configInputMax);
        safeRender();
        isSubmitting = false;
        return;
      }
    }
    if (isNaN(value) || value <= 0) {
      addLog("Invalid input. Please enter a positive number.", "error");
      configInput.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    if (configForm.configType === "loopHours" && value < 1) {
      addLog("Invalid input. Minimum is 1 hour.", "error");
      configInput.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
  } catch (error) {
    addLog(`Invalid format: ${error.message}`, "error");
    configInput.clearValue();
    screen.focusPush(configInput);
    safeRender();
    isSubmitting = false;
    return;
  }

  if (configForm.configType === "bundleRepetitions") {
    dailyActivityConfig.bundleRepetitions = Math.floor(value);
    addLog(`Bundle Repetitions set to ${dailyActivityConfig.bundleRepetitions}`, "success");
  } else if (configForm.configType === "addContactRepetitions") {
    dailyActivityConfig.addContactRepetitions = Math.floor(value);
    addLog(`Add Contact Repetitions set to ${dailyActivityConfig.addContactRepetitions}`, "success");
  } else if (configForm.configType === "swapRepetitions") {
    dailyActivityConfig.swapRepetitions = Math.floor(value);
    addLog(`Swap Repetitions set to ${dailyActivityConfig.swapRepetitions}`, "success");
  } else if (configForm.configType === "tcentSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.tcentSwapRange.min = value;
    dailyActivityConfig.tcentSwapRange.max = maxValue;
    addLog(`TCENT Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "smplSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.smplSwapRange.min = value;
    dailyActivityConfig.smplSwapRange.max = maxValue;
    addLog(`SMPL Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "bullSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.bullSwapRange.min = value;
    dailyActivityConfig.bullSwapRange.max = maxValue;
    addLog(`BULL Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "flipSwapRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.flipSwapRange.min = value;
    dailyActivityConfig.flipSwapRange.max = maxValue;
    addLog(`FLIP Swap Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "transferRepetitions") { 
    dailyActivityConfig.transferRepetitions = Math.floor(value);
    addLog(`Transfer Repetitions set to ${dailyActivityConfig.transferRepetitions}`, "success");
  } else if (configForm.configType === "tcentTransferRange") {
    if (value > maxValue) {
      addLog("Min value cannot be greater than Max value.", "error");
      configInput.clearValue();
      configInputMax.clearValue();
      screen.focusPush(configInput);
      safeRender();
      isSubmitting = false;
      return;
    }
    dailyActivityConfig.tcentTransferRange.min = value;
    dailyActivityConfig.tcentTransferRange.max = maxValue;
    addLog(`TCENT Transfer Range set to ${value} - ${maxValue}`, "success");
  } else if (configForm.configType === "loopHours") {
    dailyActivityConfig.loopHours = value;
    addLog(`Loop Daily set to ${value} hours`, "success");
  }
  saveConfig();
  updateStatus();

  configForm.hide();
  dailyActivitySubMenu.show();
  setTimeout(() => {
    if (dailyActivitySubMenu.visible) {
      screen.focusPush(dailyActivitySubMenu);
      dailyActivitySubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
    isSubmitting = false;
  }, 100);
});

configInput.key(["enter"], () => {
  if (["tcentSwapRange", "smplSwapRange", "bullSwapRange", "flipSwapRange", "tcentTransferRange"].includes(configForm.configType)) {
    screen.focusPush(configInputMax);
  } else {
    configForm.submit();
  }
});

configInputMax.key(["enter"], () => {
  configForm.submit();
});



configForm.key(["escape"], () => {
  configForm.hide();
  dailyActivitySubMenu.show();
  setTimeout(() => {
    if (dailyActivitySubMenu.visible) {
      screen.focusPush(dailyActivitySubMenu);
      dailyActivitySubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

dailyActivitySubMenu.key(["escape"], () => {
  dailyActivitySubMenu.hide();
  menuBox.show();
  setTimeout(() => {
    if (menuBox.visible) {
      screen.focusPush(menuBox);
      menuBox.style.border.fg = "cyan";
      dailyActivitySubMenu.style.border.fg = "blue";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

keyInput.key(["enter"], () => {
  keyForm.submit();
});


keyForm.on("submit", () => {
  const key = keyInput.getValue().trim();
  if (key) {
    fs.writeFileSync(TWO_CAPTCHA_FILE, JSON.stringify({ twoCaptchaKey: key }));
    addLog("2Captcha key saved successfully.", "success");
  } else {
    addLog("Invalid key.", "error");
  }
  keyForm.hide();
  faucetSubMenu.show();
  setTimeout(() => {
    if (faucetSubMenu.visible) {
      screen.focusPush(faucetSubMenu);
      faucetSubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

keyForm.key(["escape"], () => {
  keyForm.hide();
  faucetSubMenu.show();
  setTimeout(() => {
    if (faucetSubMenu.visible) {
      screen.focusPush(faucetSubMenu);
      faucetSubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

faucetSubMenu.key(["escape"], () => {
  faucetSubMenu.hide();
  menuBox.show();
  setTimeout(() => {
    if (menuBox.visible) {
      screen.focusPush(menuBox);
      menuBox.style.border.fg = "cyan";
      faucetSubMenu.style.border.fg = "green";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

nextFaucetBox.key(["escape"], () => {
  nextFaucetBox.hide();
  faucetSubMenu.show();
  setTimeout(() => {
    if (faucetSubMenu.visible) {
      screen.focusPush(faucetSubMenu);
      faucetSubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

function loadTwoCaptchaKey() {
  try {
    if (fs.existsSync(TWO_CAPTCHA_FILE)) {
      const data = fs.readFileSync(TWO_CAPTCHA_FILE, "utf8");
      const config = JSON.parse(data);
      return config.twoCaptchaKey;
    }
  } catch (error) {
    addLog(`Failed to load 2Captcha key: ${error.message}`, "error");
  }
  return null;
}

async function solveTurnstile(twoCaptchaKey) {
  try {
    addLog(`Sending captcha task to 2Captcha for solving.`, "info");
    const res = await axios.post('https://2captcha.com/in.php', null, {
      params: {
        key: twoCaptchaKey,
        method: 'turnstile',
        sitekey: TURNSTILE_SITEKEY,
        pageurl: PAGE_URL,
        json: 1
      }
    });
    if (res.data.status !== 1) {
      throw new Error(res.data.request);
    }
    const requestId = res.data.request;

    addLog(`Captcha task sent, waiting for solution (ID: ${requestId})...`, "wait");
    let token;
    while (true) {
      await sleep(5000);
      const poll = await axios.get('https://2captcha.com/res.php', {
        params: {
          key: twoCaptchaKey,
          action: 'get',
          id: requestId,
          json: 1
        }
      });
      if (poll.data.status === 1) {
        token = poll.data.request;
        addLog(`Captcha solved successfully.`, "success");
        break;
      } else if (poll.data.request === 'CAPCHA_NOT_READY') {
        addLog(`Captcha not ready yet, polling again...`, "wait");
        continue;
      } else {
        throw new Error(poll.data.request);
      }
    }
    return token;
  } catch (error) {
    addLog(`Failed to solve Turnstile: ${error.message}`, "error");
    throw error;
  }
}

async function claimFaucet(account, proxyUrl) {
  account.isClaiming = true;
  try {
    addLog(`Checking faucet eligibility for ${getShortAddress(account.smartAddress)}`, "info");
    const userRes = await makeApiCall('https://api.testnet.incentiv.io/api/user', 'GET', null, proxyUrl, account.token);
    if (userRes.code !== 200) {
      throw new Error('Failed to fetch user data');
    }
    const nextTimestamp = userRes.result.nextFaucetRequestTimestamp;
    account.nextFaucetTime = nextTimestamp;
    if (Date.now() < nextTimestamp) {
      addLog(`Account ${getShortAddress(account.smartAddress)} not eligible for faucet yet. Next at ${new Date(nextTimestamp).toLocaleString()}`, "warn");
      return false;
    } else {
      addLog(`Account eligible for faucet claim. Proceeding...`, "success");
    }

    const usingProxy = proxyUrl ? `Yes (${proxyUrl})` : 'No';
    const ip = await getIP(proxyUrl);
    addLog(`Preparing to claim faucet. Using proxy: ${usingProxy}, IP: ${ip}`, "info");

    const twoCaptchaKey = loadTwoCaptchaKey();
    if (!twoCaptchaKey) {
      throw new Error('2Captcha key not set');
    }

    const token = await solveTurnstile(twoCaptchaKey);
    addLog(`Submitting faucet claim with solved captcha.`, "info");
    const payload = { verificationToken: token };
    const faucetRes = await makeApiCall('https://api.testnet.incentiv.io/api/user/faucet', 'POST', payload, proxyUrl, account.token);
    if (faucetRes.code !== 200) {
      throw new Error('Failed to claim faucet');
    }

    account.nextFaucetTime = faucetRes.result.nextFaucetRequestTimestamp;
    addLog(`Faucet claimed successfully for ${getShortAddress(account.smartAddress)}. Amount: ${faucetRes.result.amount}, Next: ${new Date(faucetRes.result.nextFaucetRequestTimestamp).toLocaleString()}`, "success");
    return true;
  } catch (error) {
    addLog(`Faucet claim failed for ${getShortAddress(account.smartAddress)}: ${error.message}`, "error");
    return false;
  } finally {
    account.isClaiming = false;
  }
}

async function autoClaimFaucet() {
  let twoCaptchaKey = loadTwoCaptchaKey();
  if (!twoCaptchaKey) {
    addLog("2Captcha key not found. Please set it first.", "error");
    keyForm.show();
    setTimeout(() => {
      if (keyForm.visible) {
        screen.focusPush(keyInput);
        keyInput.clearValue();
        safeRender();
      }
    }, 100);
    return;
  }

  isFaucetRunning = true;
  shouldStopFaucet = false;
  isStoppingFaucet = false;
  updateFaucetMenu();
  updateStatus();
  safeRender();

  addLog("Starting Auto Claim Faucet..", "info");

  async function faucetLoop() {
    if (shouldStopFaucet) {
      isFaucetRunning = false;
      shouldStopFaucet = false;
      addLog("Auto claim faucet stopped.", "success");
      updateFaucetMenu();
      updateStatus();
      safeRender();
      return;
    }

    let claimed = 0;
    let minNext = Infinity;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const proxyUrl = proxies[i % proxies.length] || null;

      if (!account.smartAddress || !(await testToken(account, proxyUrl))) {
        try {
          await loginAccount(account, proxyUrl);
        } catch (e) {}
      }

      if (account.smartAddress) {
        if (!account.nextFaucetTime || Date.now() >= account.nextFaucetTime) {
          try {
            const userRes = await makeApiCall('https://api.testnet.incentiv.io/api/user', 'GET', null, proxyUrl, account.token);
            if (userRes.code === 200) {
              account.nextFaucetTime = userRes.result.nextFaucetRequestTimestamp;
            }
          } catch (e) {
            addLog(`Failed to fetch user for eligibility: ${e.message}`, "error");
            continue;
          }
        }

        if (Date.now() >= account.nextFaucetTime) {
          if (await claimFaucet(account, proxyUrl)) {
            claimed++;
          }
        }

        if (account.nextFaucetTime > Date.now()) {
          minNext = Math.min(minNext, account.nextFaucetTime);
        }
      }
    }

    if (claimed > 0) {
      addLog(`Claimed for ${claimed} accounts in this cycle.`, "success");
    } else {
      addLog("No accounts eligible in this cycle.", "info");
    }

    let waitTime = 60000; 
    if (minNext !== Infinity) {
      waitTime = minNext - Date.now() + 1000; 
      if (waitTime < 1000) waitTime = 1000;
    }

    setTimeout(faucetLoop, waitTime);
  }

  faucetLoop();
}

keyForm.on("submit", () => {
  const key = keyInput.getValue().trim();
  if (key) {
    fs.writeFileSync(TWO_CAPTCHA_FILE, JSON.stringify({ twoCaptchaKey: key }));
    addLog("2Captcha key saved successfully.", "success");
  } else {
    addLog("Invalid key.", "error");
  }
  keyForm.hide();
  faucetSubMenu.show();
  setTimeout(() => {
    if (faucetSubMenu.visible) {
      screen.focusPush(faucetSubMenu);
      faucetSubMenu.style.border.fg = "yellow";
      logBox.style.border.fg = "magenta";
      safeRender();
    }
  }, 100);
});

screen.key(["escape", "q", "C-c"], () => {
  addLog("Exiting application", "info");
  clearInterval(statusInterval);
  process.exit(0);
});

async function initialize() {
  try {
    loadConfig();
    loadAccounts();
    loadProxies();
    loadRecipients();
    updateMenu(); 
    updateStatus();
    await updateWallets();
    updateLogs();
    safeRender();
    menuBox.focus();
  } catch (error) {
    addLog(`Initialization error: ${error.message}`, "error");
  }
}

setTimeout(() => {
  adjustLayout();
  screen.on("resize", adjustLayout);
}, 100);

initialize();