import { describe, it, expect } from "vitest";
import {
  findIpAddresses,
  findIbans,
  findMacAddresses,
  findUrls,
  findSecrets,
  findNationalIds,
  findRoutingNumbers,
  findPassports,
  findDriversLicences,
  findPostalCodes,
  ibanMod97,
  israeliIdCheck,
  abaCheck,
} from "./identifiers";
import type { PIIMatch } from "../../types";

const texts = (matches: PIIMatch[]) => matches.map((m) => m.text);

/** Spans must agree with their text, or every derived box is misplaced. */
function expectConsistent(matches: PIIMatch[], source: string) {
  for (const match of matches) {
    expect(source.slice(match.start, match.end)).toBe(match.text);
  }
}

describe("findIpAddresses", () => {
  it("finds valid IPv4 addresses", () => {
    const text = "from 10.0.0.1 to 192.168.1.254 ok";
    expect(texts(findIpAddresses(text))).toEqual(["10.0.0.1", "192.168.1.254"]);
    expectConsistent(findIpAddresses(text), text);
  });

  it("rejects out-of-range and incomplete IPv4", () => {
    expect(findIpAddresses("999.1.1.1")).toHaveLength(0);
    expect(findIpAddresses("1.2.3")).toHaveLength(0);
  });

  it("finds IPv6 in full, compressed and loopback forms", () => {
    for (const sample of ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "fe80::1", "::1"]) {
      expect(texts(findIpAddresses(`addr ${sample} end`)), sample).toContain(sample);
    }
  });

  // Falls out of the enumerated alternation rather than needing a special case.
  it("does not read a clock time as an IPv6 address", () => {
    expect(findIpAddresses("meeting at 10:30:45 today")).toHaveLength(0);
  });

  it("ignores the bare unspecified address", () => {
    expect(findIpAddresses("route :: default")).toHaveLength(0);
  });
});

describe("IBAN", () => {
  it("validates the mod-97 checksum", () => {
    expect(ibanMod97("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(ibanMod97("DE89370400440532013000")).toBe(true);
    expect(ibanMod97("GB82WEST12345698765431")).toBe(false);
  });

  it("finds spaced and unspaced IBANs", () => {
    expect(texts(findIbans("pay GB82 WEST 1234 5698 7654 32 now"))).toEqual([
      "GB82 WEST 1234 5698 7654 32",
    ]);
    expect(texts(findIbans("pay DE89370400440532013000 now"))).toEqual([
      "DE89370400440532013000",
    ]);
  });

  it("rejects a checksum failure, so ordinary codes are left alone", () => {
    expect(findIbans("ref GB82WEST12345698765431 x")).toHaveLength(0);
  });
});

describe("findMacAddresses", () => {
  it("finds colon- and dash-separated addresses", () => {
    expect(texts(findMacAddresses("nic 00:1B:44:11:3A:B7 and aa-bb-cc-dd-ee-ff"))).toEqual(
      ["00:1B:44:11:3A:B7", "aa-bb-cc-dd-ee-ff"]
    );
  });

  it("rejects a mixed-separator address", () => {
    expect(findMacAddresses("00:1B-44:11:3A:B7")).toHaveLength(0);
  });
});

describe("findUrls", () => {
  it("finds http(s) and www URLs and strips trailing punctuation", () => {
    const text = "see https://ex.com/a?b=1, and www.foo.org/x.";
    expect(texts(findUrls(text))).toEqual(["https://ex.com/a?b=1", "www.foo.org/x"]);
    expectConsistent(findUrls(text), text);
  });

  // Deliberate: a bare domain is indistinguishable from a filename.
  it("does not match a bare domain", () => {
    expect(findUrls("open report.pdf or example.com")).toHaveLength(0);
  });
});

describe("findSecrets", () => {
  it("finds a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij";
    expect(texts(findSecrets(`token ${jwt} done`))).toContain(jwt);
  });

  it("finds provider-prefixed keys", () => {
    expect(texts(findSecrets("AKIAIOSFODNN7EXAMPLE"))).toContain("AKIAIOSFODNN7EXAMPLE");
    expect(texts(findSecrets("key sk_live_abcdefghij0123456789"))).toContain(
      "sk_live_abcdefghij0123456789"
    );
  });

  it("finds a keyword-gated credential and redacts only the value", () => {
    const matches = findSecrets('api_key: "abcdef1234567890"');
    expect(texts(matches)).toContain("abcdef1234567890");
    // The label itself stays readable.
    expect(texts(matches)).not.toContain("api_key");
  });

  it("finds a PEM private key block whole", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----";
    expect(texts(findSecrets(pem))).toEqual([pem]);
  });

  it("does not fire on ordinary prose", () => {
    expect(findSecrets("The secret to good bread is time and salt.")).toHaveLength(0);
  });
});

describe("national ID", () => {
  it("validates the Israeli check digit", () => {
    expect(israeliIdCheck("123456782")).toBe(true);
    expect(israeliIdCheck("039458757")).toBe(true);
    expect(israeliIdCheck("123456789")).toBe(false);
  });

  it("only matches numbers that pass the check", () => {
    expect(texts(findNationalIds("id 123456782 x"))).toEqual(["123456782"]);
    expect(findNationalIds("id 123456789 x")).toHaveLength(0);
  });

  it("does not match a longer digit run", () => {
    expect(findNationalIds("1234567821")).toHaveLength(0);
  });
});

describe("routing numbers", () => {
  it("validates the ABA checksum", () => {
    expect(abaCheck("021000021")).toBe(true);
    expect(abaCheck("011401533")).toBe(true);
    expect(abaCheck("123456789")).toBe(false);
  });

  // Context-gated: the bare form would accept one in ten of all 9-digit numbers.
  it("only matches when the surrounding text says routing", () => {
    expect(texts(findRoutingNumbers("routing 021000021"))).toEqual(["021000021"]);
    expect(findRoutingNumbers("order 021000021")).toHaveLength(0);
  });

  it("still requires the checksum to pass", () => {
    expect(findRoutingNumbers("routing 123456789")).toHaveLength(0);
  });
});

describe("passport and driving licence", () => {
  it("matches only the labelled form", () => {
    expect(texts(findPassports("Passport No: X1234567"))).toEqual(["X1234567"]);
    // An ungated pattern would eat most words in a document.
    expect(findPassports("The document X1234567 is enclosed")).toHaveLength(0);
  });

  it("matches an ICAO machine-readable zone line", () => {
    const mrz = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
    expect(texts(findPassports(mrz))).toContain(mrz);
  });

  it("matches a labelled driving licence number", () => {
    expect(texts(findDriversLicences("Driver's Licence No: D1234-5678"))).toEqual([
      "D1234-5678",
    ]);
  });
});

describe("postal codes", () => {
  it("matches ZIP+4, UK and Canadian forms", () => {
    expect(texts(findPostalCodes("mail to 62704-1234"))).toContain("62704-1234");
    expect(texts(findPostalCodes("London SW1A 1AA"))).toContain("SW1A 1AA");
    expect(texts(findPostalCodes("Toronto M5V 3L9"))).toContain("M5V 3L9");
  });

  it("matches a labelled numeric postcode", () => {
    expect(texts(findPostalCodes("Zip code: 62704"))).toContain("62704");
  });

  // The reason the bare forms were dropped: they would fire on every quantity
  // and year in a spreadsheet.
  it("does not match a bare five-digit number", () => {
    expect(findPostalCodes("quantity 62704 units")).toHaveLength(0);
  });
});
