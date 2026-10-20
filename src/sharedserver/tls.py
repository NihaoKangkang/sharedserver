"""Short-lived local certificates. Nothing is installed into a device trust store."""
from __future__ import annotations

import ipaddress
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path


def certificate_names(hosts: list[str]) -> tuple[list[str], list[ipaddress.IPv4Address | ipaddress.IPv6Address]]:
    dns, addresses = {"localhost"}, {ipaddress.ip_address("127.0.0.1"), ipaddress.ip_address("::1")}
    for host in hosts:
        try:
            address = ipaddress.ip_address(host)
            if not address.is_unspecified:
                addresses.add(address)
        except ValueError:
            if re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}", host):
                dns.add(host)
    return sorted(dns), sorted(addresses, key=str)


def create_certificate(directory: Path, hosts: list[str]) -> tuple[Path, Path]:
    cert, key_file = directory / "cert.pem", directory / "key.pem"
    dns, addresses = certificate_names(hosts)
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    except ImportError:
        openssl = shutil.which("openssl")
        if not openssl:
            raise ValueError('HTTPS needs OpenSSL or: python -m pip install "sharedserver[https]"') from None
        san = ",".join([f"DNS:{name}" for name in dns] + [f"IP:{address}" for address in addresses])
        try:
            subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-subj", "/CN=SharedServer local session", "-addext", f"subjectAltName={san}",
                            "-keyout", str(key_file), "-out", str(cert)],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
        except (OSError, subprocess.SubprocessError) as exc:
            raise ValueError('Could not generate HTTPS certificate. Install "sharedserver[https]".') from exc
    else:
        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SharedServer local session")])
        now = datetime.now(timezone.utc)
        certificate = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
                       .public_key(key.public_key()).serial_number(x509.random_serial_number())
                       .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(days=1))
                       .add_extension(x509.SubjectAlternativeName(
                           [x509.DNSName(value) for value in dns] + [x509.IPAddress(value) for value in addresses]), False)
                       .add_extension(x509.BasicConstraints(ca=False, path_length=None), True)
                       .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), False)
                       .sign(key, hashes.SHA256()))
        key_file.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                               serialization.NoEncryption()))
        cert.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    key_file.chmod(0o600)
    return cert, key_file
