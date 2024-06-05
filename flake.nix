{
  description = "cfn-changeset-viewer";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-24.05";
  };
  outputs = { nixpkgs, ... }:
    let
      shell = { system }:
        let
          pkgs = import nixpkgs {
            system = system;
          };
        in
        pkgs.mkShell {
          buildInputs = [
            pkgs.awscli2
            pkgs.nodejs_20
          ];
        };
    in
    {
      devShells.aarch64-darwin.default = shell { system = "aarch64-darwin"; };
      devShells.x86_64-darwin.default = shell { system = "x86_64-darwin"; };
      devShells.aarch64-linux.default = shell { system = "aarch64-linux"; };
      devShells.x86_64-linux.default = shell { system = "x86_64-linux"; };
    };
}
